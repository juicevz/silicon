from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi.testclient import TestClient

from app.catalog import SPECS
from app.config import Settings
from app.models import Market, ProviderQuote
from app.rental_planner import RentalPlanRequest, rental_plan


def listing(price=2, hours=0, **kwargs):
    return ProviderQuote(id='provider', provider='Provider', price=price, scope='instance', source_url='https://example.test/pricing', updated_at=(datetime.now(timezone.utc)-timedelta(hours=hours)).isoformat(), **kwargs)


def test_cost_units_freshness_and_duplicate_listings():
    market=Market(id='h100-sxm', **SPECS['h100-sxm'], providers=[listing(), listing(), listing(price=1,hours=999), listing(price=3,instance='other')])
    plan=rental_plan(RentalPlanRequest(market='h100-sxm', machines=2, gpus_per_machine=8, hours_per_day=Decimal('6'),days=7), market, Settings(_env_file=None))
    assert plan.total_gpus == 16 and Decimal(plan.total_gpu_hours) == 672
    assert len(plan.estimates) == 2 and plan.excluded_stale_listings == 1
    cheapest=plan.estimates[0]
    assert Decimal(cheapest.daily_usd) == 192
    assert Decimal(cheapest.monthly_usd) == 5760
    assert Decimal(cheapest.total_usd) == 1344
    assert plan.reference_stale


def test_endpoint_and_input_limits(api_module):
    with TestClient(api_module.app) as client:
        assert client.post('/api/v1/rental-plan',json={'market':'h100-sxm'}).status_code == 200
        for field,value in [('machines',0),('machines',1.5),('gpus_per_machine',65),('hours_per_day','0'),('hours_per_day','24.01'),('hours_per_day','1.001'),('days',366),('market','unknown')]:
            assert client.post('/api/v1/rental-plan',json={'market':'h100-sxm',field:value}).status_code == 422
