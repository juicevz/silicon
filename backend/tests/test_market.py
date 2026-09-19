from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.chain import fee_for
from app.catalog import SPECS, MarketId
from app.market_data import H100_BASKET, calculate
from app.models import QuoteRequest
from app.pricing import preview
from app.store import Store


def payload():
    at = datetime.now(UTC).isoformat()
    return {
        "prices": [
            {
                "provider_id": key,
                "provider": key,
                "instance": value[0],
                "region": value[1],
                "usd_per_gpu_hour": str(2 + i),
                "price_type": "on_demand",
                "status": "live",
                "price_scope": "instance",
                "listed_currency": "USD",
                "last_confirmed_at": at,
                "source_url": "https://example.com/pricing",
            }
            for i, (key, value) in enumerate(H100_BASKET.items())
        ]
    }


def test_fixed_median_and_missing_constituent():
    source = payload()
    value, _, count = calculate("h100-sxm", source)
    assert value == Decimal("4") and count == 5
    source["prices"].pop()
    assert calculate("h100-sxm", source)[0] is None


@pytest.mark.parametrize(
    "field,value",
    [
        ("price_scope", "gpu_only"),
        ("listed_currency", "EUR"),
        ("price_type", "spot"),
        ("instance", "different instance"),
        ("region", "new region"),
        ("usd_per_gpu_hour", "NaN"),
        ("last_confirmed_at", (datetime.now(UTC) - timedelta(hours=4)).isoformat()),
    ],
)
def test_changed_or_bad_constituent_withholds_index(field, value):
    source = payload()
    source["prices"][0][field] = value
    assert calculate("h100-sxm", source)[0] is None


def test_provider_duplicate_does_not_get_extra_weight():
    source = payload()
    source["prices"].extend([source["prices"][0]] * 20)
    assert calculate("h100-sxm", source)[0] == Decimal("4")


def test_catalogue_models_accept_preview_quotes_without_enabling_execution():
    from typing import get_args

    assert set(SPECS) == set(get_args(MarketId))
    assert len(SPECS) == 16
    for model in SPECS:
        quote = preview(QuoteRequest(market=model), 2, 100)
        assert quote.indicative is True
        assert quote.contract_address is None


@pytest.mark.parametrize("model", [m for m in SPECS if m != "h100-sxm"])
def test_monitoring_models_need_three_distinct_eligible_providers(model):
    source = payload()
    source["prices"] = source["prices"][:3]
    value, _, count = calculate(model, source)
    assert value == Decimal("3") and count == 3
    source["prices"][2]["price_type"] = "spot"
    source["prices"].extend([source["prices"][0]] * 8)
    assert calculate(model, source)[0] is None


def test_fee_threshold_is_strict_and_decimal_aware():
    for decimals in (6, 18):
        threshold = 5000 * 10**decimals
        assert fee_for(threshold, decimals, 100) == 100
        assert fee_for(threshold + 1, decimals, 100) == 0


def test_preview_cap_loss_and_scaling():
    result = preview(
        QuoteRequest(premium=Decimal("2"), move_pct=Decimal("4")), 3.85, 100
    )
    assert Decimal(result.payout) == 4
    assert Decimal(result.profit) == Decimal("1.98")
    assert Decimal(result.max_loss) == Decimal("2.02")
    assert Decimal(result.breakeven_pct) == Decimal("2.02")
    large = preview(
        QuoteRequest(premium=Decimal("20"), move_pct=Decimal("40")), 3.85, 0
    )
    assert Decimal(large.payout) == Decimal(large.max_payout) == 100
    assert Decimal(large.breakeven_pct) == 2
    put = preview(QuoteRequest(side="put", move_pct=Decimal("-4")), 3.85, 0)
    assert Decimal(put.payout) == 4
    assert Decimal(put.breakeven_pct) == -2


def test_missing_history_not_fabricated_and_baseline_survives_restart(tmp_path):
    store = Store(tmp_path)
    at = datetime.now(UTC).isoformat()
    assert store.baseline("h100-sxm", "3.85", at)[0] == "3.85"
    store.record("h100-sxm", at, "3.85", "100", {})
    store.record("h100-sxm", at, "3.85", "100", {})
    assert len(store.history("h100-sxm")) == 1
    assert store.change("h100-sxm", 3.85, 1) is None
    store.close()
    store = Store(tmp_path)
    assert store.baseline("h100-sxm", "4", at)[0] == "3.85"
    store.close()


def test_observation_receipt_is_immutable(tmp_path):
    store = Store(tmp_path)
    at = datetime.now(UTC).isoformat()
    store.record("h100-sxm", at, "3.85", "100", {})
    receipt = store.receipts("h100-sxm")[0]
    assert store.receipt(receipt["hash"])["price"] == "3.85"
    with pytest.raises(ValueError, match="silently revised"):
        store.record("h100-sxm", at, "4", "103", {})
    assert store.history("h100-sxm")[0]["price"] == 3.85
    store.close()


def test_one_old_observation_does_not_create_zero_percent_history(tmp_path):
    store = Store(tmp_path)
    at = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    store.record("h100-sxm", at, "3.85", "100", {})
    assert store.change("h100-sxm", 3.85, 1) is None
    latest = datetime.now(UTC).isoformat()
    store.record("h100-sxm", latest, "4", "103.9", {})
    assert store.change("h100-sxm", 4, 1) == round((4 / 3.85 - 1) * 100, 4)
    store.close()
