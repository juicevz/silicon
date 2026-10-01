import asyncio
import hashlib
import json
import logging
import secrets
from datetime import UTC, datetime, timedelta

from pywebpush import WebPushException, webpush

from ..config import Settings
from ..market_data import MarketData, age
from ..movers import identity
from ..store import Store, now
from .models import AlertEvent, AlertInbox, AlertRequest, AlertRule, PushSubscription

log = logging.getLogger("silicon.alerts")


class Alerts:
    def __init__(self, settings: Settings, store: Store, data: MarketData):
        self.settings, self.store, self.data = settings, store, data
        self.db = store.db
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS alert_sessions(owner TEXT PRIMARY KEY, seen TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS alert_rules(id TEXT PRIMARY KEY, owner TEXT NOT NULL,
            terms TEXT NOT NULL, created TEXT NOT NULL, expires TEXT NOT NULL,
            triggered TEXT, state TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS alert_rules_owner ON alert_rules(owner);
        CREATE TABLE IF NOT EXISTS alert_events(id TEXT PRIMARY KEY, owner TEXT NOT NULL,
            alert_id TEXT NOT NULL, market TEXT NOT NULL, message TEXT NOT NULL,
            created TEXT NOT NULL, source_time TEXT, receipt_hash TEXT,
            read INTEGER NOT NULL DEFAULT 0, delivery TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS alert_events_owner ON alert_events(owner,created);
        CREATE TABLE IF NOT EXISTS alert_push(owner TEXT PRIMARY KEY, payload TEXT NOT NULL,
            endpoint_hash TEXT UNIQUE NOT NULL);
        """)
        self.db.commit()

    def owner(self, token: str) -> str:
        digest = hashlib.sha256(token.encode()).hexdigest()
        exists = self.db.execute("SELECT 1 FROM alert_sessions WHERE owner=?", (digest,)).fetchone()
        if not exists and self.db.execute("SELECT COUNT(*) FROM alert_sessions").fetchone()[0] >= 10000:
            raise ValueError("Alert enrollment is full. Try again later.")
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO alert_sessions VALUES (?,?)", (digest, now()))
        return digest

    def state(self, market_id: str) -> dict:
        market = self.data.markets[market_id]
        fresh = not market.stale and -300 <= age(market.source_updated_at) <= self.settings.source_stale_seconds
        # Provider changes use fresh exact listings even when the median is withheld.
        providers = {json.dumps(identity(row.model_dump())): row.price for row in market.providers
                     if -300 <= age(row.updated_at) <= self.settings.source_stale_seconds}
        return {"fresh": fresh, "providers": providers, "source_time": market.source_updated_at}

    def create(self, owner: str, body: AlertRequest) -> AlertRule:
        count = self.db.execute("SELECT COUNT(*) FROM alert_rules WHERE owner=?", (owner,)).fetchone()[0]
        if count >= 20:
            raise ValueError("Remove an alert before adding another. Server limit: 20.")
        stamp = datetime.now(UTC)
        item = AlertRule(**body.model_dump(), id=secrets.token_hex(16), created_at=stamp.isoformat(),
                         expires_at=(stamp + timedelta(days=90)).isoformat())
        with self.db:
            self.db.execute("INSERT INTO alert_rules VALUES (?,?,?,?,?,?,?)",
                (item.id, owner, body.model_dump_json(), item.created_at, item.expires_at, None, json.dumps(self.state(body.market))))
        return item

    def inbox(self, owner: str) -> AlertInbox:
        rules = [AlertRule(**json.loads(row["terms"]), id=row["id"], created_at=row["created"],
                          expires_at=row["expires"], triggered_at=row["triggered"])
                 for row in self.db.execute("SELECT * FROM alert_rules WHERE owner=? ORDER BY created DESC", (owner,))]
        events = [AlertEvent(id=row["id"], alert_id=row["alert_id"], market=row["market"], message=row["message"],
                            created_at=row["created"], source_time=row["source_time"], receipt_hash=row["receipt_hash"],
                            read=bool(row["read"]), delivery=row["delivery"])
                  for row in self.db.execute("SELECT * FROM alert_events WHERE owner=? ORDER BY created DESC LIMIT 100", (owner,))]
        available = bool(self.settings.alerts_vapid_public_key and self.settings.alerts_vapid_private_key_path
                         and self.settings.alerts_vapid_private_key_path.is_file())
        return AlertInbox(rules=rules, events=events,
                          push_enabled=bool(self.db.execute("SELECT 1 FROM alert_push WHERE owner=?", (owner,)).fetchone()),
                          push_available=available, vapid_public_key=self.settings.alerts_vapid_public_key if available else None)

    def remove(self, owner: str, rule_id: str) -> None:
        with self.db:
            self.db.execute("DELETE FROM alert_rules WHERE id=? AND owner=?", (rule_id, owner))
            self.db.execute("DELETE FROM alert_events WHERE alert_id=? AND owner=?", (rule_id, owner))

    def subscribe(self, owner: str, body: PushSubscription) -> None:
        digest = hashlib.sha256(body.endpoint.encode()).hexdigest()
        existing = self.db.execute("SELECT owner FROM alert_push WHERE endpoint_hash=?", (digest,)).fetchone()
        if existing and existing["owner"] != owner:
            raise ValueError("This browser subscription belongs to another alert session. Disable it and enable it again.")
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO alert_push VALUES (?,?,?)", (owner, body.model_dump_json(), digest))

    def unsubscribe(self, owner: str) -> None:
        with self.db:
            self.db.execute("DELETE FROM alert_push WHERE owner=?", (owner,))
            self.db.execute("UPDATE alert_events SET delivery='inbox' WHERE owner=? AND delivery='pending'", (owner,))

    async def poll(self) -> None:
        stamp = now()
        rules = self.db.execute("SELECT * FROM alert_rules WHERE triggered IS NULL AND expires>?", (stamp,)).fetchall()
        states = {key: self.state(key) for key in self.data.markets}
        for row in rules:
            body = AlertRequest.model_validate_json(row["terms"])
            previous, current = json.loads(row["state"]), states[body.market]
            market = self.data.markets[body.market]
            message = None
            event_time = market.source_updated_at
            if body.kind == "price" and current["fresh"] and market.price is not None:
                hit = market.price >= body.price if body.direction == "above" else market.price <= body.price
                if hit:
                    message = f"{market.name} rental reference is {body.direction} ${body.price:.4f}/GPU-hour (${market.price:.4f})."
            elif body.kind == "recovery" and not previous["fresh"] and current["fresh"]:
                message = "H100 benchmark recovered: all five fixed providers are fresh."
            elif body.kind == "provider":
                changes = [key for key in current["providers"].keys() & previous["providers"].keys()
                           if current["providers"][key] != previous["providers"][key]]
                if changes:
                    names = sorted({json.loads(key)[0] for key in changes})
                    message = f"{market.name}: rental listing prices changed at {', '.join(names)}."
                    event_time = max((quote.updated_at for quote in market.providers if json.dumps(identity(quote.model_dump())) in changes), default=None)
                # Keep disappeared listings so a later reappearance isn't a fake new baseline.
                current = {**current, "providers": {**previous["providers"], **current["providers"]}}
            with self.db:
                self.db.execute("UPDATE alert_rules SET state=? WHERE id=?", (json.dumps(current), row["id"]))
                if message:
                    receipt = self.db.execute("SELECT hash FROM receipts WHERE market=? AND time=?", (body.market, event_time)).fetchone()
                    delivery = "pending" if self.inbox(row["owner"]).push_enabled and self.inbox(row["owner"]).push_available else "inbox"
                    self.db.execute("INSERT INTO alert_events(id,owner,alert_id,market,message,created,source_time,receipt_hash,delivery) VALUES (?,?,?,?,?,?,?,?,?)",
                        (secrets.token_hex(16), row["owner"], row["id"], body.market, message, stamp, event_time, receipt["hash"] if receipt else None, delivery))
                    self.db.execute("UPDATE alert_rules SET triggered=? WHERE id=?", (stamp, row["id"]))
        await self.deliver()
        self.cleanup()

    def send(self, subscription: dict, payload: str) -> None:
        webpush(subscription_info=subscription, data=payload,
                vapid_private_key=str(self.settings.alerts_vapid_private_key_path),
                vapid_claims={"sub": self.settings.compute_origin}, timeout=10, ttl=86400)

    async def deliver(self) -> None:
        rows = self.db.execute("SELECT e.*,p.payload FROM alert_events e JOIN alert_push p ON p.owner=e.owner WHERE e.delivery='pending' AND e.attempts<3 ORDER BY e.created LIMIT 20").fetchall()
        for row in rows:
            subscription = PushSubscription.model_validate_json(row["payload"])
            payload = json.dumps({"id": row["id"], "message": row["message"], "url": f"/terminal?asset={row['market']}&alerts=1"})
            try:
                await asyncio.to_thread(self.send, subscription.model_dump(), payload)
                delivery = "sent"
            except WebPushException as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status in (404, 410):
                    self.unsubscribe(row["owner"])
                delivery = "failed" if status in (404, 410) or row["attempts"] >= 2 else "pending"
                log.warning("push delivery failed status=%s", status)
            except Exception:
                delivery = "failed" if row["attempts"] >= 2 else "pending"
                log.warning("push delivery failed")
            with self.db:
                self.db.execute("UPDATE alert_events SET delivery=?,attempts=attempts+1 WHERE id=?", (delivery, row["id"]))

    def cleanup(self) -> None:
        cutoff = (datetime.now(UTC) - timedelta(days=90)).isoformat()
        with self.db:
            for table in ("alert_rules", "alert_events", "alert_push"):
                self.db.execute(f"DELETE FROM {table} WHERE owner IN (SELECT owner FROM alert_sessions WHERE seen<?)", (cutoff,))
            self.db.execute("DELETE FROM alert_sessions WHERE seen<?", (cutoff,))
            self.db.execute("DELETE FROM alert_events WHERE created<?", ((datetime.now(UTC) - timedelta(days=30)).isoformat(),))
