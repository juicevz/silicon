"""Wallet ownership for private holder tools, independent of Compute credit grants."""
import hashlib
import secrets
from datetime import UTC, datetime
from time import time
from urllib.parse import urlparse

from eth_account import Account
from eth_account.messages import encode_defunct
from eth_keys.exceptions import BadSignature
from eth_utils import to_checksum_address
from fastapi import HTTPException

from ..compute.models import Challenge
from ..config import Settings
from ..store import Store


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class HolderAuth:
    def __init__(self, settings: Settings, store: Store):
        self.settings, self.db = settings, store.db
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS holder_challenges(id TEXT PRIMARY KEY, address TEXT NOT NULL,
            message TEXT NOT NULL, binding TEXT NOT NULL, client TEXT NOT NULL,
            expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS holder_sessions(hash TEXT PRIMARY KEY, address TEXT NOT NULL, expires INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS holder_session_owner ON holder_sessions(address);
        """)

    def challenge(self, address: str, client: str) -> tuple[Challenge, str]:
        if int(address, 16) == 0:
            raise HTTPException(400, "Choose a wallet to sign in.")
        at = int(time())
        binding, nonce = secrets.token_urlsafe(32), secrets.token_hex(16)
        identifier = secrets.token_urlsafe(24)
        origin = self.settings.compute_origin
        message = (f"{urlparse(origin).netloc} wants you to sign in with your Ethereum account:\n"
                   f"{to_checksum_address(address)}\n\nSign in to Silicon holder tools. This does not authorize transactions.\n\n"
                   f"URI: {origin}/terminal\nVersion: 1\nChain ID: {self.settings.chain_id}\nNonce: {nonce}\n"
                   f"Issued At: {datetime.fromtimestamp(at, UTC).isoformat()}\n"
                   f"Expiration Time: {datetime.fromtimestamp(at + 300, UTC).isoformat()}")
        with self.db:
            self.db.execute("DELETE FROM holder_challenges WHERE expires<=?", (at,))
            self.db.execute("DELETE FROM holder_sessions WHERE expires<=?", (at,))
            count = self.db.execute("SELECT COUNT(*) FROM holder_challenges WHERE (client=? OR address=?) AND expires>?", (digest(client), address.lower(), at + 240)).fetchone()[0]
            total = self.db.execute("SELECT COUNT(*) FROM holder_challenges").fetchone()[0]
            if count >= 5 or total >= 2000:
                raise HTTPException(429, "Please wait before signing in again.")
            self.db.execute("INSERT INTO holder_challenges VALUES (?,?,?,?,?,?,0)", (identifier, address.lower(), message, digest(binding), digest(client), at + 300))
        return Challenge(id=identifier, message=message, expires_at=at + 300), binding

    def verify(self, identifier: str, signature: str, binding: str) -> tuple[str, str]:
        at = int(time())
        row = self.db.execute("SELECT * FROM holder_challenges WHERE id=? AND expires>? AND used=0", (identifier, at)).fetchone()
        if not row or not secrets.compare_digest(row["binding"], digest(binding)):
            raise HTTPException(401, "Sign-in expired or opened in another browser. Try again.")
        try:
            address = Account.recover_message(encode_defunct(text=row["message"]), signature=signature).lower()
        except (ValueError, TypeError, BadSignature):
            raise HTTPException(401, "The wallet signature could not be verified.") from None
        if address != row["address"]:
            raise HTTPException(401, "Sign with the wallet that started this request.")
        token = secrets.token_urlsafe(40)
        with self.db:
            if self.db.execute("SELECT COUNT(*) FROM holder_sessions WHERE expires>?", (at,)).fetchone()[0] >= 20000:
                raise HTTPException(503, "Sign-in is at capacity. Please try again later.")
            used = self.db.execute("UPDATE holder_challenges SET used=1 WHERE id=? AND used=0 AND expires>?", (identifier, at))
            if not used.rowcount:
                raise HTTPException(401, "This sign-in request has already been used.")
            # Bound sessions while keeping multiple devices signed in.
            self.db.execute("DELETE FROM holder_sessions WHERE hash IN (SELECT hash FROM holder_sessions WHERE address=? ORDER BY expires DESC LIMIT -1 OFFSET 9)", (address,))
            self.db.execute("INSERT INTO holder_sessions VALUES (?,?,?)", (digest(token), address, at + 43200))
        return token, address

    def authenticate(self, token: str, expected: str) -> str:
        row = self.db.execute("SELECT address FROM holder_sessions WHERE hash=? AND expires>?", (digest(token[:200]), int(time()))).fetchone()
        if not row or row["address"] != expected.lower():
            raise HTTPException(401, "Sign in with this wallet to open your saved holder tools.")
        return row["address"]

    def logout(self, token: str) -> None:
        with self.db:
            self.db.execute("DELETE FROM holder_sessions WHERE hash=?", (digest(token[:200]),))
