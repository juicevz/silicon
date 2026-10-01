"""Daily changes derived from immutable source receipts, never chart interpolation."""
import json
from datetime import datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field

from .models import Market
from .store import Store, now


class ProviderMove(BaseModel):
    provider: str
    instance: str | None
    region: str | None
    previous: float
    current: float
    change_pct: float
    source_url: str


class Mover(BaseModel):
    market: str
    name: str
    price: float | None
    change_pct: float | None = None
    coverage: int
    required_providers: int
    status: Literal["ready", "stale", "insufficient_history", "basket_changed"]
    source_time: str | None = None
    baseline_time: str | None = None
    receipt_hash: str | None = None
    baseline_receipt_hash: str | None = None
    provider_moves: list[ProviderMove] = Field(default_factory=list)


class Movers(BaseModel):
    generated_at: str
    window_hours: int = 24
    markets: list[Mover]


def identity(row: dict) -> tuple:
    return row.get("id"), row.get("instance"), row.get("region"), row.get("scope")


def daily_movers(store: Store, markets: list[Market]) -> Movers:
    results = []
    for market in markets:
        item = Mover(market=market.id, name=market.name, price=market.price,
                     coverage=market.coverage, required_providers=market.required_providers,
                     status="stale" if market.stale else "insufficient_history", source_time=market.source_updated_at)
        latest = store.db.execute("SELECT * FROM receipts WHERE market=? ORDER BY time DESC LIMIT 1", (market.id,)).fetchone()
        if latest:
            item.receipt_hash = latest["hash"]
        if market.stale or not latest:
            results.append(item)
            continue
        at = datetime.fromisoformat(latest["time"])
        cutoff = at - timedelta(hours=24)
        old = store.db.execute("SELECT * FROM receipts WHERE market=? AND time<=? ORDER BY time DESC LIMIT 1", (market.id, cutoff.isoformat())).fetchone()
        if not old or (cutoff - datetime.fromisoformat(old["time"])).total_seconds() > 7200:
            results.append(item)
            continue
        current, previous = json.loads(latest["payload"]), json.loads(old["payload"])
        item.baseline_time, item.baseline_receipt_hash = old["time"], old["hash"]
        before = {identity(row): row for row in previous["constituents"]}
        after = {identity(row): row for row in current["constituents"]}
        for key in before.keys() & after.keys():
            a, b = float(before[key]["price"]), float(after[key]["price"])
            if a > 0 and a != b:
                row = after[key]
                item.provider_moves.append(ProviderMove(provider=row["provider"], instance=row.get("instance"),
                    region=row.get("region"), previous=a, current=b, change_pct=round((b / a - 1) * 100, 4), source_url=row["source_url"]))
        item.provider_moves.sort(key=lambda row: abs(row.change_pct), reverse=True)
        if before.keys() != after.keys():
            item.status = "basket_changed"
        elif float(previous["price"]) > 0:
            item.status = "ready"
            item.change_pct = round((float(current["price"]) / float(previous["price"]) - 1) * 100, 4)
        results.append(item)
    results.sort(key=lambda row: (row.change_pct is None, -abs(row.change_pct or 0), row.name))
    return Movers(generated_at=now(), markets=results)
