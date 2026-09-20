import asyncio
import logging
from datetime import UTC, datetime
from decimal import Decimal
from statistics import median
from typing import Any

import httpx

from .config import Settings
from .catalog import SPECS
from .models import Market, Point, ProviderQuote
from .store import Store, now

log = logging.getLogger("silicon.data")
# Each identity includes region and exact instance. A changed identity cannot silently
# replace a constituent. All five are required for the H100 reference to be published.
H100_BASKET = {
    "lambda": ("H100 SXM", None),
    "hyperstack": ("NVIDIA H100 SXM", None),
    "datacrunch": ("1H100.80S.30V", None),
    "crusoe": ("H100 80GB HGX", None),
    "nebius": ("NVIDIA HGX H100", None),
}
METHOD = "silicon-h100-v1"


def age(value: str | None) -> float:
    if not value:
        return float("inf")
    try:
        return (
            datetime.now(UTC) - datetime.fromisoformat(value.replace("Z", "+00:00"))
        ).total_seconds()
    except (ValueError, TypeError):
        return float("inf")


def eligible(row: dict[str, Any]) -> bool:
    try:
        price = Decimal(str(row.get("usd_per_gpu_hour")))
        return (
            row.get("price_type") == "on_demand"
            and row.get("status") == "live"
            and row.get("price_scope") == "instance"
            and row.get("listed_currency") == "USD"
            and -300 <= age(row.get("last_confirmed_at")) <= 10800
            and price.is_finite()
            and 0 < price < 1000
            and str(row.get("source_url", "")).startswith("https://")
        )
    except Exception:
        return False


def calculate(
    model: str, payload: dict[str, Any]
) -> tuple[Decimal | None, list[ProviderQuote], int]:
    quotes: list[ProviderQuote] = []
    selected: dict[str, Decimal] = {}
    selected_rows: dict[str, int] = {}
    for row in payload.get("prices", []):
        if not eligible(row):
            continue
        key = row["provider_id"]
        value = Decimal(str(row["usd_per_gpu_hour"]))
        included = model != "h100-sxm" or (
            key in H100_BASKET
            and (row.get("instance"), row.get("region")) == H100_BASKET[key]
        )
        if included and (key not in selected or value < selected[key]):
            selected[key] = value
            selected_rows[key] = len(quotes)
        quotes.append(
            ProviderQuote(
                id=key,
                provider=row["provider"],
                price=float(value),
                region=row.get("region"),
                instance=row.get("instance"),
                scope=row["price_scope"],
                source_url=row["source_url"],
                updated_at=row["last_confirmed_at"],
                included=False,
            )
        )
    # Receipts must contain exactly the listings used by the median, including
    # when the source repeats a provider or lists several equally priced offers.
    for index in selected_rows.values():
        quotes[index].included = True
    required = 5 if model == "h100-sxm" else 3
    result = median(selected.values()) if len(selected) >= required else None
    return result, sorted(quotes, key=lambda q: q.price), len(selected)


class MarketData:
    def __init__(self, settings: Settings, store: Store):
        self.settings, self.store = settings, store
        self.markets = {key: Market(id=key, **spec) for key, spec in SPECS.items()}
        for key, payload in store.snapshots().items():
            if key in self.markets:
                self.markets[key] = Market.model_validate(payload).model_copy(
                    update=SPECS[key]
                )

    async def collect_one(self, client: httpx.AsyncClient, model: str) -> None:
        try:
            response = await client.get(
                f"https://gpueconomy.com/gpu/{model}/prices.json"
            )
            response.raise_for_status()
            payload = response.json()
            at = payload["data_updated_at"]
            if not -300 <= age(at) <= self.settings.source_stale_seconds:
                raise ValueError("source timestamp is outside the freshness window")
            value, quotes, count = calculate(model, payload)
            market = self.markets[model].model_copy(deep=True)
            market.providers, market.coverage, market.quote_count = (
                quotes,
                count,
                len(quotes),
            )
            market.required_providers = 5 if model == "h100-sxm" else 3
            market.collected_at = now()
            if value is None:
                market.status, market.stale = "withheld", True
                self.markets[model] = market
                return
            base, since = self.store.baseline(model, str(value), at)
            index = (value / Decimal(base) * 100).quantize(Decimal("0.0001"))
            market.price, market.index, market.baseline = (
                float(value),
                float(index),
                float(base),
            )
            market.history_since = since
            market.source_updated_at, market.stale = at, False
            market.status = "benchmark" if model == "h100-sxm" else "tracking"
            self.store.record(model, at, str(value), str(index), market.model_dump())
            self.markets[model] = market
        except Exception as exc:
            if isinstance(exc, ValueError):
                self.markets[model].stale = True
                self.markets[model].status = "withheld"
            log.warning(
                "collection failed model=%s reason=%s", model, type(exc).__name__
            )

    async def collect(self) -> None:
        async with httpx.AsyncClient(
            timeout=20,
            headers={"User-Agent": "SiliconCompute/1.0 (+https://gpueconomy.com/data)"},
        ) as client:
            await asyncio.gather(*(self.collect_one(client, key) for key in SPECS))

    def snapshot(self) -> list[Market]:
        result = []
        for key, stored in self.markets.items():
            market = stored.model_copy(deep=True)
            market.stale = (
                market.stale
                or age(market.source_updated_at) > self.settings.source_stale_seconds
            )
            market.history = [
                Point.model_validate(row) for row in self.store.history(key)
            ]
            market.changes = {
                str(h) + "h": self.store.change(key, market.price, h)
                if market.price is not None and not market.stale
                else None
                for h in (1, 6, 24)
            }
            result.append(market)
        return result
