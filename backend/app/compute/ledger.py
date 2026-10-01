"""Durable admission, credentials and conservative request reservations.

Only metadata is stored here. Prompts, answers, signatures and plaintext keys
never enter SQLite. A request with uncertain provider billing keeps its hold.
"""

import hashlib
import secrets
import sqlite3
from contextlib import contextmanager
from decimal import Decimal, ROUND_CEILING
from pathlib import Path
from time import time
from typing import Iterator

from fastapi import HTTPException

from ..config import Settings
from .models import ComputeAccount, CreatedKey, KeyInfo, KeyUpdate, UsageRecord

SCALE = Decimal(1_000_000_000)


def atoms(value: Decimal | str | int) -> int:
    amount = Decimal(str(value))
    if not amount.is_finite() or amount < 0:
        raise ValueError("Invalid usage amount")
    return int((amount * SCALE).to_integral_value(rounding=ROUND_CEILING))


def dollars(value: int) -> str:
    return format(Decimal(value) / SCALE, ".9f")


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class ComputeLedger:
    def __init__(self, root: Path, settings: Settings):
        root.mkdir(parents=True, exist_ok=True)
        self.settings = settings
        self.db = sqlite3.connect(root / "silicon.sqlite", isolation_level=None, timeout=10, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS compute_accounts (
            address TEXT PRIMARY KEY, granted INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS compute_challenges (
            id TEXT PRIMARY KEY, address TEXT NOT NULL, message TEXT NOT NULL,
            expires_at INTEGER NOT NULL, client_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS compute_sessions (
            hash TEXT PRIMARY KEY, address TEXT NOT NULL, expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS compute_keys (
            id TEXT PRIMARY KEY, address TEXT NOT NULL, hash TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL, prefix TEXT NOT NULL, created_at INTEGER NOT NULL,
            last_used_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS compute_requests (
            id TEXT PRIMARY KEY, address TEXT NOT NULL, client_id TEXT NOT NULL,
            fingerprint TEXT NOT NULL, model TEXT NOT NULL, mode TEXT NOT NULL,
            reserved INTEGER NOT NULL, cost INTEGER, status TEXT NOT NULL,
            generation_id TEXT, prompt_tokens INTEGER, completion_tokens INTEGER,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
            UNIQUE(address, client_id));
        CREATE INDEX IF NOT EXISTS compute_usage_owner ON compute_requests(address, created_at);
        CREATE INDEX IF NOT EXISTS compute_usage_status ON compute_requests(status, updated_at);
        CREATE INDEX IF NOT EXISTS compute_keys_owner ON compute_keys(address);
        CREATE INDEX IF NOT EXISTS compute_challenge_client ON compute_challenges(client_hash, created_at);
        """)

        # Additive upgrades preserve existing keys and all unresolved reservations.
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(compute_keys)")}
        for name, definition in (("paused", "INTEGER NOT NULL DEFAULT 0"), ("spend_limit", "INTEGER")):
            if name not in columns:
                self.db.execute(f"ALTER TABLE compute_keys ADD COLUMN {name} {definition}")
        if "key_id" not in {row[1] for row in self.db.execute("PRAGMA table_info(compute_requests)")}:
            self.db.execute("ALTER TABLE compute_requests ADD COLUMN key_id TEXT")
        self.db.execute("CREATE INDEX IF NOT EXISTS compute_usage_key ON compute_requests(key_id, status)")

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield self.db
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise

    def challenge(self, address: str, message: str, challenge_id: str, client: str) -> None:
        at = int(time())
        with self.transaction() as db:
            db.execute("DELETE FROM compute_challenges WHERE expires_at<?", (at,))
            db.execute("DELETE FROM compute_sessions WHERE expires_at<?", (at,))
            count = db.execute("SELECT COUNT(*) FROM compute_challenges WHERE client_hash=? AND created_at>?", (digest(client), at - 60)).fetchone()[0]
            total = db.execute("SELECT COUNT(*) FROM compute_challenges").fetchone()[0]
            if count >= 5 or total >= 2000:
                raise HTTPException(429, "Please wait before signing in again.")
            db.execute("INSERT INTO compute_challenges VALUES (?,?,?,?,?,?)", (challenge_id, address.lower(), message, at + 300, digest(client), at))

    def pending_challenge(self, challenge_id: str) -> sqlite3.Row:
        row = self.db.execute("SELECT * FROM compute_challenges WHERE id=? AND expires_at>=?", (challenge_id, int(time()))).fetchone()
        if not row:
            raise HTTPException(401, "This sign-in request has expired. Sign in again.")
        return row

    def sign_in(self, challenge_id: str, address: str) -> str:
        at = int(time())
        token = secrets.token_urlsafe(40)
        with self.transaction() as db:
            row = db.execute("SELECT * FROM compute_challenges WHERE id=? AND expires_at>=?", (challenge_id, at)).fetchone()
            if not row or row["address"] != address:
                raise HTTPException(401, "This sign-in request is no longer valid.")
            db.execute("DELETE FROM compute_challenges WHERE id=?", (challenge_id,))
            exists = db.execute("SELECT 1 FROM compute_accounts WHERE address=?", (address,)).fetchone()
            if not exists:
                count, grants = db.execute("SELECT COUNT(*), COALESCE(SUM(granted),0) FROM compute_accounts").fetchone()
                if count >= self.settings.compute_max_accounts:
                    raise HTTPException(403, "Compute access is currently full. Please check back later.")
                eligible = self.settings.compute_open_enrollment or address in self.settings.compute_allowed_wallets
                grant = atoms(self.settings.compute_grant_usd) if eligible else 0
                if grants + grant > atoms(self.settings.compute_grant_pool_usd):
                    grant = 0
                db.execute("INSERT INTO compute_accounts(address,granted,created_at) VALUES (?,?,?)", (address, grant, at))
            db.execute("INSERT INTO compute_sessions VALUES (?,?,?)", (digest(token), address, at + 43200))
        return token

    def authenticate(self, token: str, *, api_key: bool = False) -> str:
        if len(token) > 200:
            raise HTTPException(401, "Sign in to Compute to continue.")
        if api_key:
            row = self.db.execute("SELECT address FROM compute_keys WHERE hash=? AND revoked=0", (digest(token),)).fetchone()
            if row:
                self.db.execute("UPDATE compute_keys SET last_used_at=? WHERE hash=?", (int(time()), digest(token)))
        else:
            row = self.db.execute("SELECT address FROM compute_sessions WHERE hash=? AND expires_at>?", (digest(token), int(time()))).fetchone()
        if not row:
            raise HTTPException(401, "Sign in to Compute to continue." if not api_key else "Invalid or revoked Silicon API key.")
        return row["address"]

    def logout(self, token: str) -> None:
        self.db.execute("DELETE FROM compute_sessions WHERE hash=?", (digest(token),))

    def account(self, address: str) -> ComputeAccount:
        row = self.db.execute("SELECT * FROM compute_accounts WHERE address=?", (address,)).fetchone()
        if not row:
            raise HTTPException(401, "Sign in to Compute to continue.")
        pending, count = self.db.execute("SELECT COALESCE(SUM(CASE WHEN status IN ('reserved','pending') THEN reserved ELSE 0 END),0), COUNT(*) FROM compute_requests WHERE address=?", (address,)).fetchone()
        available = max(0, row["granted"] - row["used"] - pending)
        access = "ready" if available else "pending" if pending else "exhausted" if row["granted"] else "pending"
        if not self.settings.compute_enabled:
            access = "unavailable"
        return ComputeAccount(address=address, available_usd=dollars(available), used_usd=dollars(row["used"]), pending_usd=dollars(pending), request_count=count, access=access)

    def authenticate_key(self, token: str) -> tuple[str, str]:
        address = self.authenticate(token, api_key=True)
        row = self.db.execute("SELECT id FROM compute_keys WHERE hash=? AND address=? AND revoked=0", (digest(token), address)).fetchone()
        if row is None:
            raise HTTPException(401, "Invalid or revoked Silicon API key.")
        return address, row["id"]

    def key_info(self, row: sqlite3.Row) -> KeyInfo:
        held, used, count = self.db.execute("SELECT COALESCE(SUM(CASE WHEN status IN ('reserved','pending') THEN reserved ELSE 0 END),0), COALESCE(SUM(CASE WHEN status NOT IN ('reserved','pending') THEN COALESCE(cost,0) ELSE 0 END),0),COUNT(*) FROM compute_requests WHERE key_id=? AND address=?", (row["id"], row["address"])).fetchone()
        limit = row["spend_limit"]
        return KeyInfo(id=row["id"], name=row["name"], prefix=row["prefix"], created_at=row["created_at"],
            last_used_at=row["last_used_at"], revoked=bool(row["revoked"]), paused=bool(row["paused"]),
            limit_usd=dollars(limit) if limit is not None else None, used_usd=dollars(used), pending_usd=dollars(held),
            available_usd=dollars(max(0, limit - used - held)) if limit is not None else None, request_count=count)

    def keys(self, address: str) -> list[KeyInfo]:
        return [self.key_info(row) for row in self.db.execute("SELECT * FROM compute_keys WHERE address=? ORDER BY created_at DESC LIMIT 100", (address,))]

    def key(self, address: str, key_id: str) -> KeyInfo:
        row = self.db.execute("SELECT * FROM compute_keys WHERE address=? AND id=?", (address, key_id)).fetchone()
        if row is None:
            raise HTTPException(404, "Key not found.")
        return self.key_info(row)

    def create_key(self, address: str, name: str, limit_usd: Decimal | None = None) -> CreatedKey:
        token = "sil_" + secrets.token_urlsafe(32)
        key_id = secrets.token_urlsafe(18)
        with self.transaction() as db:
            count = db.execute("SELECT COUNT(*) FROM compute_keys WHERE address=? AND revoked=0", (address,)).fetchone()[0]
            if count >= 5:
                raise HTTPException(409, "Revoke an unused key before creating another.")
            db.execute("INSERT INTO compute_keys(id,address,hash,name,prefix,created_at,spend_limit) VALUES (?,?,?,?,?,?,?)", (key_id, address, digest(token), name, token[:8] + "…" + token[-4:], int(time()), atoms(limit_usd) if limit_usd is not None else None))
            row = db.execute("SELECT * FROM compute_keys WHERE id=?", (key_id,)).fetchone()
        return CreatedKey(key=token, info=self.key_info(row))

    def update_key(self, address: str, key_id: str, body: KeyUpdate) -> KeyInfo:
        with self.transaction() as db:
            row = db.execute("SELECT * FROM compute_keys WHERE id=? AND address=?", (key_id, address)).fetchone()
            if row is None:
                raise HTTPException(404, "Key not found.")
            if row["revoked"]:
                raise HTTPException(409, "Revoked keys cannot be changed. Create a new key.")
            if "limit_usd" in body.model_fields_set:
                limit = atoms(body.limit_usd) if body.limit_usd is not None else None
                db.execute("UPDATE compute_keys SET spend_limit=? WHERE id=? AND address=?", (limit, key_id, address))
            if "paused" in body.model_fields_set:
                db.execute("UPDATE compute_keys SET paused=? WHERE id=? AND address=?", (int(body.paused), key_id, address))
        return self.key(address, key_id)

    def revoke_key(self, address: str, key_id: str) -> None:
        result = self.db.execute("UPDATE compute_keys SET revoked=1 WHERE id=? AND address=?", (key_id, address))
        if not result.rowcount:
            raise HTTPException(404, "Key not found.")

    def reserve(self, address: str, client_id: str, fingerprint: str, model: str, mode: str, amount: int, key_id: str | None = None) -> str:
        at = int(time())
        request_id = secrets.token_urlsafe(18)
        with self.transaction() as db:
            existing = db.execute("SELECT fingerprint FROM compute_requests WHERE address=? AND client_id=?", (address, client_id)).fetchone()
            if existing:
                raise HTTPException(409, "This request was already submitted. Check Usage before sending it again.")
            account = db.execute("SELECT * FROM compute_accounts WHERE address=?", (address,)).fetchone()
            if not account:
                raise HTTPException(401, "Sign in to Compute to continue.")
            held, active = db.execute("SELECT COALESCE(SUM(reserved),0),COUNT(*) FROM compute_requests WHERE address=? AND status IN ('reserved','pending')", (address,)).fetchone()
            if active >= 2:
                raise HTTPException(429, "Wait for your current requests to finish.")
            recent = db.execute("SELECT COUNT(*) FROM compute_requests WHERE address=? AND created_at>?", (address, at - 60)).fetchone()[0]
            if recent >= 12:
                raise HTTPException(429, "Please wait a moment before sending another request.")
            if amount <= 0 or account["granted"] - account["used"] - held < amount:
                raise HTTPException(402, "There is not enough available usage for this request. Try a shorter conversation.")
            if mode == "api" and key_id is None:
                raise HTTPException(401, "A verified API key is required.")
            if key_id is not None:
                key = db.execute("SELECT * FROM compute_keys WHERE id=? AND address=?", (key_id, address)).fetchone()
                if key is None or key["revoked"]:
                    raise HTTPException(401, "Invalid or revoked Silicon API key.")
                if key["paused"]:
                    raise HTTPException(403, "This API key is paused. Resume it in Compute API access.")
                key_total = db.execute("SELECT COALESCE(SUM(CASE WHEN status IN ('reserved','pending') THEN reserved ELSE COALESCE(cost,0) END),0) FROM compute_requests WHERE key_id=? AND address=?", (key_id, address)).fetchone()[0]
                if key["spend_limit"] is not None and key_total + amount > key["spend_limit"]:
                    raise HTTPException(402, "This API key has reached its spending limit. Check its used and pending costs.")
            total, global_active = db.execute("SELECT COALESCE(SUM(CASE WHEN status IN ('reserved','pending') THEN reserved ELSE COALESCE(cost,0) END),0),COALESCE(SUM(CASE WHEN status IN ('reserved','pending') THEN 1 ELSE 0 END),0) FROM compute_requests").fetchone()
            if total + amount > atoms(self.settings.compute_spend_limit_usd) or global_active >= 10:
                raise HTTPException(503, "Compute is at capacity. Please try again later.")
            db.execute("INSERT INTO compute_requests(id,address,client_id,fingerprint,model,mode,reserved,status,created_at,updated_at,key_id) VALUES (?,?,?,?,?,?,?,'reserved',?,?,?)", (request_id, address, client_id, fingerprint, model, mode, amount, at, at, key_id))
        return request_id

    def generation(self, request_id: str, generation_id: str) -> None:
        self.db.execute("UPDATE compute_requests SET generation_id=?,updated_at=? WHERE id=? AND status IN ('reserved','pending')", (generation_id[:200], int(time()), request_id))

    def pending(self, request_id: str) -> None:
        self.db.execute("UPDATE compute_requests SET status='pending',updated_at=? WHERE id=? AND status='reserved'", (int(time()), request_id))

    def settle(self, request_id: str, cost: int, prompt_tokens: int | None = None, completion_tokens: int | None = None, *, failed: bool = False) -> None:
        if cost < 0:
            raise ValueError("Negative usage cost")
        with self.transaction() as db:
            row = db.execute("SELECT * FROM compute_requests WHERE id=?", (request_id,)).fetchone()
            if not row or row["status"] not in ("reserved", "pending"):
                return
            db.execute("UPDATE compute_requests SET cost=?,status=?,prompt_tokens=?,completion_tokens=?,updated_at=? WHERE id=?", (cost, "failed" if failed else "completed", prompt_tokens, completion_tokens, int(time()), request_id))
            db.execute("UPDATE compute_accounts SET used=used+? WHERE address=?", (cost, row["address"]))

    def unreconciled(self) -> list[sqlite3.Row]:
        return self.db.execute("SELECT * FROM compute_requests WHERE status IN ('reserved','pending') AND updated_at<? ORDER BY updated_at LIMIT 20", (int(time()) - 120,)).fetchall()

    def usage(self, address: str, key_id: str | None = None) -> list[UsageRecord]:
        if key_id is not None:
            self.key(address, key_id)
        rows = self.db.execute("SELECT r.*, k.name AS key_name FROM compute_requests r LEFT JOIN compute_keys k ON k.id=r.key_id AND k.address=r.address WHERE r.address=? AND (? IS NULL OR r.key_id=?) ORDER BY r.created_at DESC,r.rowid DESC LIMIT 50", (address, key_id, key_id)).fetchall()
        return [UsageRecord(key_id=row["key_id"], key_name=row["key_name"], id=row["id"], model=row["model"], mode=row["mode"], status=row["status"], cost_usd=dollars(row["cost"]) if row["cost"] is not None else None, prompt_tokens=row["prompt_tokens"], completion_tokens=row["completion_tokens"], created_at=row["created_at"]) for row in rows]

    def close(self) -> None:
        self.db.close()
