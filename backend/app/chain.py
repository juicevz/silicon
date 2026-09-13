import asyncio
import re
import time
from decimal import Decimal
from typing import Any

import httpx
from eth_abi import decode, encode
from eth_utils import keccak

from .config import Settings
from .models import Access, Network, Protocol
from .store import now

ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")


def fee_for(balance: int, decimals: int, standard: int) -> int:
    return 0 if balance > 5000 * 10**decimals else standard


class Chain:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.network = Network(chain_id=settings.chain_id)
        self.protocol = Protocol(
            address=settings.market_address or None,
            token_configured=bool(settings.token_address),
        )
        self._cache: dict[str, tuple[float, Access]] = {}

    async def rpc(self, method: str, params: list[Any]) -> Any:
        async with httpx.AsyncClient(timeout=9) as client:
            response = await client.post(
                self.settings.rpc_url,
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
            )
            response.raise_for_status()
            data = response.json()
            if "error" in data:
                raise ValueError("RPC rejected the request")
            return data["result"]

    async def call(
        self,
        address: str,
        signature: str,
        types: list[str],
        values: list[Any],
        outputs: list[str],
    ) -> Any:
        data = "0x" + (keccak(text=signature)[:4] + encode(types, values)).hex()
        result = await self.rpc("eth_call", [{"to": address, "data": data}, "latest"])
        decoded = decode(outputs, bytes.fromhex(result[2:]))
        return decoded[0] if len(decoded) == 1 else decoded

    async def poll(self) -> None:
        started = time.monotonic()
        try:
            chain_id, block = await asyncio.gather(
                self.rpc("eth_chainId", []), self.rpc("eth_blockNumber", [])
            )
            if int(chain_id, 16) != self.settings.chain_id:
                raise ValueError("chain mismatch")
            self.network = Network(
                connected=True,
                block=int(block, 16),
                latency_ms=round((time.monotonic() - started) * 1000),
                checked_at=now(),
                chain_id=self.settings.chain_id,
            )
        except Exception:
            self.network.connected = False
            self.network.error = "RPC temporarily unavailable"
            self.network.checked_at = now()

    async def access(self, address: str) -> Access:
        if not ADDRESS.fullmatch(address):
            raise ValueError("Invalid wallet address")
        key = address.lower()
        cached = self._cache.get(key)
        if cached and time.monotonic() - cached[0] < 10:
            return cached[1]
        result = Access(
            address=address,
            checked_at=now(),
            fee_bps=self.settings.fee_bps,
            token_configured=bool(self.settings.token_address),
        )
        try:
            # Never use a wallet balance from the wrong chain or an unverified token.
            cid = await self.rpc("eth_chainId", [])
            if int(cid, 16) != self.settings.chain_id:
                raise ValueError("chain mismatch")
            usdg, usdg_dec, eth = await asyncio.gather(
                self.call(
                    self.settings.usdg_address,
                    "balanceOf(address)",
                    ["address"],
                    [address],
                    ["uint256"],
                ),
                self.call(self.settings.usdg_address, "decimals()", [], [], ["uint8"]),
                self.rpc("eth_getBalance", [address, "latest"]),
            )
            if usdg_dec != 6:
                raise ValueError("Unexpected USDG decimals")
            result.usdg, result.eth = (
                str(Decimal(usdg) / 10**6),
                str(Decimal(int(eth, 16)) / 10**18),
            )
            if self.settings.token_address:
                token, decimals = await asyncio.gather(
                    self.call(
                        self.settings.token_address,
                        "balanceOf(address)",
                        ["address"],
                        [address],
                        ["uint256"],
                    ),
                    self.call(
                        self.settings.token_address, "decimals()", [], [], ["uint8"]
                    ),
                )
                result.token_balance = str(Decimal(token) / 10**decimals)
                result.holder = result.advanced = token > 0
                result.fee_bps = fee_for(token, decimals, self.settings.fee_bps)
                result.fee_free = result.fee_bps == 0
            result.verified = True
        except Exception:
            result.error = "Balances could not be verified. Try again shortly."
        self._cache = {
            k: v for k, v in self._cache.items() if time.monotonic() - v[0] < 60
        }
        self._cache[key] = (time.monotonic(), result)
        return result
