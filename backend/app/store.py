import json
import sqlite3
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from eth_utils import keccak


def now() -> str:
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, root: Path):
        root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(root / "silicon.sqlite", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS observations (
            market TEXT NOT NULL, time TEXT NOT NULL, price TEXT NOT NULL,
            index_value TEXT NOT NULL, PRIMARY KEY(market, time));
        CREATE TABLE IF NOT EXISTS snapshots (
            market TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS baselines (
            market TEXT PRIMARY KEY, price TEXT NOT NULL, time TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events (
            tx TEXT NOT NULL, log_index INTEGER NOT NULL, block INTEGER NOT NULL,
            payload TEXT NOT NULL, PRIMARY KEY(tx, log_index));
        CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS receipts (
            hash TEXT PRIMARY KEY, market TEXT NOT NULL, time TEXT NOT NULL,
            payload TEXT NOT NULL, UNIQUE(market,time));
        """)
        self.db.commit()

    def baseline(self, market: str, price: str, at: str) -> tuple[str, str]:
        self.db.execute(
            "INSERT OR IGNORE INTO baselines VALUES (?,?,?)", (market, price, at)
        )
        self.db.commit()
        row = self.db.execute(
            "SELECT price,time FROM baselines WHERE market=?", (market,)
        ).fetchone()
        return row["price"], row["time"]

    def record(
        self, market: str, at: str, price: str, index: str, payload: dict[str, Any]
    ) -> None:
        previous = self.db.execute(
            "SELECT price FROM observations WHERE market=? AND time=?", (market, at)
        ).fetchone()
        if previous and Decimal(previous["price"]) != Decimal(price):
            raise ValueError("A source observation cannot be silently revised")
        receipt = {
            "market": market,
            "source_updated_at": at,
            "price": price,
            "index": index,
            "methodology": "silicon-h100-v1"
            if market == "h100-sxm"
            else "provider-median-v1",
            "source": "https://gpueconomy.com/data",
            "license": "CC BY 4.0",
            "constituents": [
                row for row in payload.get("providers", []) if row.get("included")
            ],
        }
        canonical = json.dumps(receipt, sort_keys=True, separators=(",", ":"))
        digest = "0x" + keccak(text=canonical).hex()
        with self.db:
            self.db.execute(
                "INSERT OR IGNORE INTO observations VALUES (?,?,?,?)",
                (market, at, price, index),
            )
            self.db.execute(
                "INSERT OR REPLACE INTO snapshots VALUES (?,?)",
                (market, json.dumps(payload)),
            )
            self.db.execute(
                "INSERT OR IGNORE INTO receipts VALUES (?,?,?,?)",
                (digest, market, at, canonical),
            )

    def receipts(self, market: str, after: str | None = None) -> list[dict[str, Any]]:
        rows = self.db.execute(
            "SELECT * FROM receipts WHERE market=? AND time>=? ORDER BY time DESC LIMIT 200",
            (market, after or ""),
        ).fetchall()
        return [
            {"hash": row["hash"], "receipt": json.loads(row["payload"])} for row in rows
        ]

    def receipt(self, digest: str) -> dict[str, Any] | None:
        row = self.db.execute(
            "SELECT payload FROM receipts WHERE hash=?", (digest,)
        ).fetchone()
        return json.loads(row["payload"]) if row else None

    def snapshots(self) -> dict[str, dict[str, Any]]:
        return {
            r["market"]: json.loads(r["payload"])
            for r in self.db.execute("SELECT * FROM snapshots")
        }

    def history(self, market: str, hours: int = 24) -> list[dict[str, Any]]:
        since = (datetime.now(UTC) - timedelta(hours=hours)).isoformat()
        rows = self.db.execute(
            "SELECT * FROM observations WHERE market=? AND time>=? ORDER BY time",
            (market, since),
        ).fetchall()
        return [
            {
                "time": r["time"],
                "price": float(r["price"]),
                "index": float(r["index_value"]),
            }
            for r in rows
        ]

    def change(self, market: str, price: float, hours: int) -> float | None:
        latest = self.db.execute(
            "SELECT time FROM observations WHERE market=? ORDER BY time DESC LIMIT 1",
            (market,),
        ).fetchone()
        if latest is None:
            return None
        cutoff = (
            datetime.fromisoformat(latest["time"]) - timedelta(hours=hours)
        ).isoformat()
        row = self.db.execute(
            "SELECT price,time FROM observations WHERE market=? AND time<=? ORDER BY time DESC LIMIT 1",
            (market, cutoff),
        ).fetchone()
        if (
            not row
            or (
                datetime.fromisoformat(cutoff) - datetime.fromisoformat(row["time"])
            ).total_seconds()
            > 7200
        ):
            return None
        previous = float(row["price"])
        return round((price / previous - 1) * 100, 4) if previous > 0 else None

    def close(self) -> None:
        self.db.close()

    def state(self, key: str, fallback: Any = None) -> Any:
        row = self.db.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else fallback

    def set_state(self, key: str, value: Any) -> None:
        with self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO state VALUES (?,?)", (key, json.dumps(value))
            )

    def event(
        self, tx: str, log_index: int, block: int, payload: dict[str, Any]
    ) -> None:
        with self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO events VALUES (?,?,?,?)",
                (tx, log_index, block, json.dumps(payload)),
            )

    def events(self) -> list[dict[str, Any]]:
        return [
            json.loads(row["payload"])
            for row in self.db.execute(
                "SELECT payload FROM events ORDER BY block,log_index"
            )
        ]
