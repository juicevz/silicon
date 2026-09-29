"""Forward paper records. Entries and outcomes use archived source receipts only."""

import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_DOWN
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .store import Store


class PaperRequest(BaseModel):
    kind: Literal["trend", "generation_spread"] = "trend"
    side: Literal["call", "put"] = "put"
    days: Literal[7, 14, 30] = 14
    units: Decimal = Field(default=Decimal("1"), ge=1, le=1000, decimal_places=3)
    premium_per_unit: Decimal = Field(default=Decimal("2"), ge=Decimal("0.1"), le=Decimal("9.9"), decimal_places=6)
    thesis: str = Field(default="", max_length=600)
    request_id: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9-]{16,64}$")

    @field_validator("thesis")
    @classmethod
    def clean_thesis(cls, value: str) -> str:
        return value.strip()


class PaperRecord(BaseModel):
    id: str
    kind: Literal["trend", "generation_spread"]
    side: Literal["call", "put"]
    days: int
    units: str
    premium_per_unit: str
    fee_bps: int = 100
    cost: str
    created_at: str
    expiry: str
    entry_prices: dict[str, str]
    entry_receipts: dict[str, str]
    status: Literal["open", "settled", "cancelled"] = "open"
    exit_prices: dict[str, str] = Field(default_factory=dict)
    exit_receipts: dict[str, str] = Field(default_factory=dict)
    move_pct: str | None = None
    payout: str | None = None
    profit: str | None = None
    closed_at: str | None = None
    thesis: str = ""


class Evidence(BaseModel):
    market: str
    observations: int
    distinct_prices: int
    history_hours: float
    latest_at: str | None
    latest_price: str | None
    fresh: bool


class StrategyOverview(BaseModel):
    evidence: list[Evidence]
    spread_live: bool = False
    spread_reason: str = "B200 is a comparison reference. A fixed benchmark, deployed spread series and funding are required for live trades."


class PaperBook(BaseModel):
    records: list[PaperRecord]
    settled_count: int
    realized_profit: str


def amount(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.000001"), rounding=ROUND_DOWN))


class Strategies:
    def __init__(self, store: Store):
        self.store = store
        with store.db:
            store.db.execute("""CREATE TABLE IF NOT EXISTS paper_strategies (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, created_at TEXT NOT NULL,
                payload TEXT NOT NULL)""")
            store.db.execute("CREATE INDEX IF NOT EXISTS paper_owner ON paper_strategies(owner)")
            store.db.execute("""CREATE TABLE IF NOT EXISTS paper_requests (
                owner TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
                record_id TEXT NOT NULL, PRIMARY KEY(owner,request_id))""")

    @staticmethod
    def owner(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    def overview(self, at: datetime | None = None) -> StrategyOverview:
        at = at or datetime.now(UTC)
        evidence = []
        for market in ("h100-sxm", "b200"):
            rows = self.store.db.execute(
                "SELECT time,price FROM observations WHERE market=? AND time>=? AND time<=? ORDER BY time",
                (market, (at - timedelta(days=30)).isoformat(), at.isoformat()),
            ).fetchall()
            evidence.append(Evidence(
                market=market, observations=len(rows), distinct_prices=len({Decimal(r["price"]) for r in rows}),
                history_hours=round((datetime.fromisoformat(rows[-1]["time"]) - datetime.fromisoformat(rows[0]["time"])).total_seconds() / 3600, 1) if rows else 0,
                latest_at=rows[-1]["time"] if rows else None,
                latest_price=rows[-1]["price"] if rows else None,
                fresh=bool(rows and 0 <= (at - datetime.fromisoformat(rows[-1]["time"])).total_seconds() <= 10800),
            ))
        return StrategyOverview(evidence=evidence)

    def reference(self, market: str, start: datetime, end: datetime, *, latest: bool = False) -> dict | None:
        order = "DESC" if latest else "ASC"
        row = self.store.db.execute(
            f"SELECT hash,payload,time FROM receipts WHERE market=? AND time>=? AND time<=? ORDER BY time {order} LIMIT 1",
            (market, start.isoformat(), end.isoformat()),
        ).fetchone()
        if not row:
            return None
        receipt = json.loads(row["payload"])
        if Decimal(receipt["price"]) <= 0:
            return None
        return {"price": receipt["price"], "hash": row["hash"], "time": row["time"]}

    def create(self, token: str, request: PaperRequest, at: datetime | None = None) -> PaperRecord:
        at = at or datetime.now(UTC)
        owner = self.owner(token)
        fingerprint = hashlib.sha256(json.dumps(request.model_dump(mode="json", exclude={"request_id"}), sort_keys=True).encode()).hexdigest()
        if request.request_id:
            previous = self.store.db.execute(
                "SELECT fingerprint,record_id FROM paper_requests WHERE owner=? AND request_id=?",
                (owner, request.request_id),
            ).fetchone()
            if previous:
                if previous["fingerprint"] != fingerprint:
                    raise ValueError("This request was already used for different entry terms.")
                row = self.store.db.execute("SELECT payload FROM paper_strategies WHERE id=? AND owner=?", (previous["record_id"], owner)).fetchone()
                return self.settle(PaperRecord.model_validate_json(row[0]), at)
        if self.store.db.execute("SELECT count(*) FROM paper_strategies WHERE owner=?", (owner,)).fetchone()[0] >= 100:
            raise ValueError("This browser already has 100 recorded strategies.")
        if self.store.db.execute("SELECT count(*) FROM paper_strategies").fetchone()[0] >= 100000:
            raise ValueError("The paper strategy recorder is at capacity.")
        markets = ["h100-sxm"] if request.kind == "trend" else ["h100-sxm", "b200"]
        entries = {m: self.reference(m, at - timedelta(hours=3), at, latest=True) for m in markets}
        if any(v is None for v in entries.values()):
            raise ValueError("Fresh recorded references are needed before starting this strategy.")
        times = [datetime.fromisoformat(v["time"]) for v in entries.values() if v]
        if (max(times) - min(times)).total_seconds() > 900:
            raise ValueError("The two GPU references must be observed within 15 minutes of each other.")
        premium = Decimal(amount(request.units * request.premium_per_unit))
        cost = premium + Decimal(amount(premium / 100))
        record = PaperRecord(
            id=secrets.token_hex(16), kind=request.kind, side=request.side, days=request.days,
            units=str(request.units), premium_per_unit=str(request.premium_per_unit), cost=amount(cost), thesis=request.thesis,
            created_at=at.isoformat(), expiry=(at + timedelta(days=request.days)).isoformat(),
            entry_prices={m: v["price"] for m, v in entries.items() if v},
            entry_receipts={m: v["hash"] for m, v in entries.items() if v},
        )
        with self.store.db:
            self.store.db.execute("INSERT INTO paper_strategies VALUES (?,?,?,?)", (record.id, owner, record.created_at, record.model_dump_json()))
            if request.request_id:
                self.store.db.execute("INSERT INTO paper_requests VALUES (?,?,?,?)", (owner, request.request_id, fingerprint, record.id))
        return record

    def settle(self, record: PaperRecord, at: datetime) -> PaperRecord:
        expiry = datetime.fromisoformat(record.expiry)
        if record.status != "open" or at < expiry:
            return record
        end = min(at, expiry + timedelta(hours=3))
        exits = {m: self.reference(m, expiry, end) for m in record.entry_prices}
        # If asynchronous feeds initially miss each other, advance only the
        # older leg until the first pair fits. Never use a later profitable pair.
        if len(exits) == 2:
            while all(exits.values()):
                older = min(exits, key=lambda m: exits[m]["time"])
                newer = max(exits, key=lambda m: exits[m]["time"])
                old_time = datetime.fromisoformat(exits[older]["time"])
                new_time = datetime.fromisoformat(exits[newer]["time"])
                if (new_time - old_time).total_seconds() <= 900:
                    break
                exits[older] = self.reference(older, new_time - timedelta(minutes=15), end)
        times = [datetime.fromisoformat(v["time"]) for v in exits.values() if v]
        paired = bool(times and (max(times) - min(times)).total_seconds() <= 900)
        if all(exits.values()) and paired:
            returns = {m: (Decimal(v["price"]) / Decimal(record.entry_prices[m]) - 1) * 100 for m, v in exits.items() if v}
            move = returns["h100-sxm"] if record.kind == "trend" else returns["b200"] - returns["h100-sxm"]
            points = max(Decimal(0), min(Decimal(10), move if record.side == "call" else -move))
            record.status = "settled"
            record.move_pct = amount(move)
            record.payout = amount(points * Decimal(record.units))
            record.profit = amount(Decimal(record.payout) - Decimal(record.cost))
            record.exit_prices = {m: v["price"] for m, v in exits.items() if v}
            record.exit_receipts = {m: v["hash"] for m, v in exits.items() if v}
            record.closed_at = at.isoformat()
        elif at >= expiry + timedelta(hours=24):
            record.status = "cancelled"
            record.payout, record.profit, record.closed_at = record.cost, "0.000000", at.isoformat()
        if record.status != "open":
            with self.store.db:
                self.store.db.execute("UPDATE paper_strategies SET payload=? WHERE id=?", (record.model_dump_json(), record.id))
        return record

    def book(self, token: str, at: datetime | None = None) -> PaperBook:
        at = at or datetime.now(UTC)
        records = [self.settle(PaperRecord.model_validate_json(r[0]), at) for r in self.store.db.execute(
            "SELECT payload FROM paper_strategies WHERE owner=? ORDER BY created_at DESC", (self.owner(token),)
        ).fetchall()]
        settled = [r for r in records if r.status == "settled"]
        return PaperBook(records=records, settled_count=len(settled), realized_profit=amount(sum((Decimal(r.profit or "0") for r in settled), Decimal(0))))
