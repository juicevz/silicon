"""Source-backed rental estimates. This service never books hardware."""
from decimal import Decimal

from pydantic import BaseModel, Field

from .catalog import MarketId
from .config import Settings
from .market_data import age
from .models import Market
from .store import now


class RentalPlanRequest(BaseModel):
    market: MarketId
    machines: int = Field(default=1, ge=1, le=10000)
    gpus_per_machine: int = Field(default=1, ge=1, le=64)
    hours_per_day: Decimal = Field(default=Decimal("24"), gt=0, le=24, decimal_places=2)
    days: int = Field(default=30, ge=1, le=365)


class RentalEstimate(BaseModel):
    provider: str
    provider_id: str
    instance: str | None
    region: str | None
    rate_usd_per_gpu_hour: str
    daily_usd: str
    monthly_usd: str
    total_usd: str
    source_time: str
    source_url: str
    included_in_reference: bool


class RentalPlan(BaseModel):
    market: str
    name: str
    machines: int
    gpus_per_machine: int
    total_gpus: int
    hours_per_day: str
    days: int
    total_gpu_hours: str
    generated_at: str
    reference_stale: bool
    excluded_stale_listings: int
    estimates: list[RentalEstimate]
    assumptions: list[str]


def amount(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.000001")), "f")


def rental_plan(body: RentalPlanRequest, market: Market, settings: Settings) -> RentalPlan:
    total = body.machines * body.gpus_per_machine
    daily_hours = Decimal(total) * body.hours_per_day
    estimates, stale = [], 0
    seen = set()
    for quote in sorted(market.providers, key=lambda row: row.price):
        identity = quote.id, quote.instance, quote.region, quote.scope
        if identity in seen:
            continue
        if not -300 <= age(quote.updated_at) <= settings.source_stale_seconds:
            stale += 1
            continue
        rate = Decimal(str(quote.price))
        if quote.scope != "instance" or not rate.is_finite() or rate <= 0 or not quote.source_url.startswith("https://"):
            continue
        seen.add(identity)
        daily = rate * daily_hours
        estimates.append(RentalEstimate(provider=quote.provider, provider_id=quote.id, instance=quote.instance,
            region=quote.region, rate_usd_per_gpu_hour=amount(rate), daily_usd=amount(daily),
            monthly_usd=amount(daily * 30), total_usd=amount(daily * body.days),
            source_time=quote.updated_at, source_url=quote.source_url, included_in_reference=quote.included))
    return RentalPlan(market=market.id, name=market.name, machines=body.machines,
        gpus_per_machine=body.gpus_per_machine, total_gpus=total, hours_per_day=str(body.hours_per_day),
        days=body.days, total_gpu_hours=str(daily_hours * body.days), generated_at=now(),
        reference_stale=market.stale or not -300 <= age(market.source_updated_at) <= settings.source_stale_seconds,
        excluded_stale_listings=stale, estimates=estimates, assumptions=[
            "Listing rates are normalized USD per GPU-hour for on-demand full instances.",
            "Machine count and GPUs per machine are your assumptions; provider instance size and minimum booking may differ.",
            "Daily cost = listing rate × total GPUs × hours per day. Monthly cost uses 30 days; total uses your selected duration.",
            "Rates are held constant for the estimate. Tax, storage, bandwidth, discounts and future price changes are excluded.",
            "Listings are observed prices, not guaranteed capacity, performance, availability or a booking quote.",
        ])
