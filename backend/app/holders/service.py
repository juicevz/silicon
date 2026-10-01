import asyncio
import json
import secrets
from datetime import UTC, datetime, timedelta
from time import monotonic

from fastapi import HTTPException

from ..alerts.service import Alerts
from ..chain import Chain
from ..movers import daily_movers
from ..store import now
from .auth import HolderAuth
from .models import (
    AdvancedAlert, AdvancedAlertRequest, AdvancedInbox, HolderAccount,
    SavedWorkspace, WorkspaceRequest,
)


class Holders:
    def __init__(self, chain: Chain, alerts: Alerts):
        self.chain, self.alerts = chain, alerts
        self.settings, self.store, self.data, self.db = alerts.settings, alerts.store, alerts.data, alerts.db
        self.auth = HolderAuth(self.settings, self.store)
        self._eligibility: dict[str, tuple[float, HolderAccount]] = {}
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS holder_workspaces(id TEXT PRIMARY KEY, owner TEXT NOT NULL,
            name TEXT NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL, updated TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS holder_workspace_owner ON holder_workspaces(owner);
        CREATE TABLE IF NOT EXISTS holder_rules(id TEXT PRIMARY KEY, owner TEXT NOT NULL, terms TEXT NOT NULL,
            created TEXT NOT NULL, expires TEXT NOT NULL, triggered TEXT, armed INTEGER NOT NULL,
            status TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS holder_rules_owner ON holder_rules(owner);
        """)

    async def account(self, owner: str, *, fresh: bool = False) -> HolderAccount:
        if fresh:
            self.chain.invalidate_access(owner)
        try:
            access = await asyncio.wait_for(self.chain.access(owner), timeout=8)
        except Exception:
            return HolderAccount(address=owner, verified=False, eligible=False,
                reason="Holder balance could not be verified. Saved work remains available.")
        verified = access.verified and access.benefits_verified
        eligible = verified and access.workflow_benefits
        result = HolderAccount(address=owner, verified=verified, eligible=eligible,
            reason=None if eligible else "Hold more than 5,000 SILICON to save workspaces and run advanced alerts." if verified else "Holder balance could not be verified. Saved work remains available.")
        return result

    async def require_holder(self, owner: str) -> None:
        account = await self.account(owner, fresh=True)
        if not account.eligible:
            raise HTTPException(403 if account.verified else 503, account.reason)

    def workspaces(self, owner: str) -> list[SavedWorkspace]:
        return [SavedWorkspace(id=row["id"], name=row["name"], state=json.loads(row["state"]),
            revision=row["revision"], updated_at=row["updated"])
            for row in self.db.execute("SELECT * FROM holder_workspaces WHERE owner=? ORDER BY updated DESC", (owner,))]

    def save(self, owner: str, body: WorkspaceRequest, identifier: str | None = None) -> SavedWorkspace:
        at = now()
        with self.db:
            if identifier:
                row = self.db.execute("SELECT revision FROM holder_workspaces WHERE id=? AND owner=?", (identifier, owner)).fetchone()
                if not row:
                    raise HTTPException(404, "Workspace not found.")
                changed = self.db.execute("UPDATE holder_workspaces SET name=?,state=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?",
                    (body.name, body.state.model_dump_json(), at, identifier, owner, body.revision))
                if not changed.rowcount:
                    raise HTTPException(409, "This workspace changed on another device. Load the latest version, or save your changes as a new workspace.")
            else:
                if body.revision != 0:
                    raise HTTPException(409, "A new workspace starts at revision zero.")
                count = self.db.execute("SELECT COUNT(*) FROM holder_workspaces WHERE owner=?", (owner,)).fetchone()[0]
                total = self.db.execute("SELECT COUNT(*) FROM holder_workspaces").fetchone()[0]
                if count >= 5 or total >= 25000:
                    raise HTTPException(409, "Workspace storage is full. Remove a saved workspace before adding another.")
                identifier = secrets.token_hex(16)
                self.db.execute("INSERT INTO holder_workspaces VALUES (?,?,?,?,1,?)", (identifier, owner, body.name, body.state.model_dump_json(), at))
        return SavedWorkspace(id=identifier, name=body.name, state=body.state, revision=body.revision + 1, updated_at=at)

    def remove_workspace(self, owner: str, identifier: str, revision: int) -> None:
        with self.db:
            changed = self.db.execute("DELETE FROM holder_workspaces WHERE id=? AND owner=? AND revision=?", (identifier, owner, revision))
            if not changed.rowcount:
                raise HTTPException(409, "Workspace changed or was removed. Refresh before deleting it.")

    @staticmethod
    def alert_owner(owner: str) -> str:
        return "holder:" + owner

    def inbox(self, owner: str, eligible: bool) -> AdvancedInbox:
        at = now()
        rules = []
        for row in self.db.execute("SELECT * FROM holder_rules WHERE owner=? ORDER BY created DESC", (owner,)):
            status = "expired" if row["expires"] <= at else row["status"]
            if not eligible and status not in ("expired", "complete"):
                status = "paused"
            rules.append(AdvancedAlert(**json.loads(row["terms"]), id=row["id"], created_at=row["created"],
                expires_at=row["expires"], last_triggered_at=row["triggered"], status=status))
        shared = self.alerts.inbox(self.alert_owner(owner))
        return AdvancedInbox(rules=rules, events=shared.events, push_enabled=shared.push_enabled,
            push_available=shared.push_available, vapid_public_key=shared.vapid_public_key)

    def create_alert(self, owner: str, body: AdvancedAlertRequest) -> AdvancedAlert:
        at = datetime.now(UTC)
        rule = AdvancedAlert(**body.model_dump(), id=secrets.token_hex(16), created_at=at.isoformat(),
            expires_at=(at + timedelta(days=90)).isoformat(), status="watching")
        with self.db:
            count = self.db.execute("SELECT COUNT(*) FROM holder_rules WHERE owner=?", (owner,)).fetchone()[0]
            total = self.db.execute("SELECT COUNT(*) FROM holder_rules").fetchone()[0]
            if count >= 100 or total >= 20000:
                raise HTTPException(409, "Advanced alert storage is full. Remove a rule before adding another.")
            self.db.execute("INSERT INTO holder_rules VALUES (?,?,?,?,?,NULL,1,'watching')",
                (rule.id, owner, body.model_dump_json(), rule.created_at, rule.expires_at))
        return rule

    def remove_alert(self, owner: str, identifier: str) -> None:
        with self.db:
            self.db.execute("DELETE FROM holder_rules WHERE id=? AND owner=?", (identifier, owner))
        self.alerts.remove(self.alert_owner(owner), identifier)

    async def poll(self) -> None:
        at = datetime.now(UTC)
        rows = self.db.execute("SELECT * FROM holder_rules WHERE expires>? AND status!='complete'", (at.isoformat(),)).fetchall()
        owners = {row["owner"] for row in rows}
        owners.update(row[0].removeprefix("holder:") for row in self.db.execute("SELECT DISTINCT owner FROM alert_events WHERE owner LIKE 'holder:%' AND delivery='pending' AND attempts<3"))
        # The public chain reader verifies chain, token and strict raw balance threshold.
        semaphore = asyncio.Semaphore(4)
        async def eligible(owner: str) -> tuple[str, bool]:
            cached = self._eligibility.get(owner)
            if cached and monotonic() - cached[0] < 60:
                return owner, cached[1].eligible
            async with semaphore:
                try:
                    account = await asyncio.wait_for(self.account(owner, fresh=True), timeout=12)
                except Exception:
                    account = HolderAccount(address=owner, verified=False, eligible=False)
                self._eligibility[owner] = monotonic(), account
                return owner, account.eligible
        eligibility = dict(await asyncio.gather(*(eligible(owner) for owner in owners)))
        self._eligibility = {key: value for key, value in self._eligibility.items() if key in owners}
        states = {key: self.alerts.state(key) for key in self.data.markets}
        movers = {item.market: item for item in daily_movers(self.store, self.data.snapshot()).markets} if any('"change"' in row["terms"] for row in rows) else {}
        with self.db:
            for owner, active in eligibility.items():
                if not active:
                    self.db.execute("UPDATE alert_events SET delivery='inbox' WHERE owner=? AND delivery='pending'", (self.alert_owner(owner),))
        for row in rows:
            if not eligibility[row["owner"]]:
                with self.db:
                    self.db.execute("UPDATE holder_rules SET status='paused' WHERE id=?", (row["id"],))
                    self.db.execute("UPDATE alert_events SET delivery='inbox' WHERE owner=? AND delivery='pending'", (self.alert_owner(row["owner"]),))
                continue
            body = AdvancedAlertRequest.model_validate_json(row["terms"])
            observed: list[bool | None] = []
            summaries = []
            for condition in body.conditions:
                market = self.data.markets[condition.market]
                fresh = states[condition.market]["fresh"]
                if condition.kind == "benchmark":
                    complete = fresh and market.status == "benchmark" and market.coverage == market.required_providers == 5
                    # Availability is itself the signal here. Price conditions below use
                    # unknown for missing data, preventing false price-rule resets.
                    observed.append(bool(complete))
                    summaries.append("all five H100 providers fresh")
                    continue
                value = market.price
                if condition.kind == "change":
                    move = movers.get(condition.market)
                    fresh = fresh and move is not None and move.status == "ready" and move.source_time == market.source_updated_at
                    value = move.change_pct if fresh else None
                if not fresh or value is None:
                    observed.append(None)
                    continue
                observed.append(value >= condition.threshold if condition.direction == "above" else value <= condition.threshold)
                summaries.append(f"{market.name} ${value:.4f}/GPU-hour" if condition.kind == "price" else f"{market.name} {value:+.2f}% over 24h")
            armed = bool(row["armed"])
            fire = False
            if any(value is None for value in observed):
                status = "waiting_data"
            elif not all(observed):
                status, armed = "watching", True
            elif not armed:
                status = "waiting_reset"
            elif row["triggered"] and (at - datetime.fromisoformat(row["triggered"])).total_seconds() < body.cooldown_minutes * 60:
                status = "cooldown"
            else:
                fire, armed, status = True, False, "waiting_reset" if body.recurring else "complete"
            with self.db:
                self.db.execute("UPDATE holder_rules SET armed=?,status=? WHERE id=?", (int(armed), status, row["id"]))
                if fire:
                    market_id = body.conditions[0].market
                    source_time = self.data.markets[market_id].source_updated_at
                    receipt = self.db.execute("SELECT hash FROM receipts WHERE market=? AND time=?", (market_id, source_time)).fetchone()
                    identity = self.alert_owner(row["owner"])
                    inbox = self.alerts.inbox(identity)
                    delivery = "pending" if inbox.push_available and inbox.push_enabled else "inbox"
                    self.db.execute("INSERT INTO alert_events(id,owner,alert_id,market,message,created,source_time,receipt_hash,delivery) VALUES (?,?,?,?,?,?,?,?,?)",
                        (secrets.token_hex(16), identity, row["id"], market_id, f"{body.name}: {'; '.join(summaries)}.", at.isoformat(), source_time, receipt["hash"] if receipt else None, delivery))
                    self.db.execute("UPDATE holder_rules SET triggered=? WHERE id=?", (at.isoformat(), row["id"]))
        # Only verified holders can receive premium notifications. Basic monitoring has its own loop.
        await self.alerts.deliver({self.alert_owner(owner) for owner, active in eligibility.items() if active})
