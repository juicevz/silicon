import asyncio
import time
from collections import defaultdict
from decimal import Decimal
from typing import Any

from eth_abi import decode
from eth_utils import keccak

from .chain import ADDRESS, Chain
from .market_data import METHOD
from .models import (
    Leaderboard,
    LeaderRow,
    Portfolio,
    PositionView,
    Protocol,
    Quote,
    QuoteRequest,
    Series,
    TradeEvent,
)
from .store import Store, now


def stable(value: int) -> str:
    return str(Decimal(value) / 10**6)


class ProtocolReader:
    def __init__(self, chain: Chain, store: Store):
        self.chain, self.store = chain, store
        self.address = chain.settings.market_address
        self.snapshot = Protocol(
            address=self.address or None,
            token_configured=bool(chain.settings.token_address),
        )
        self.positions: dict[int, dict[str, Any]] = {}
        self.finalized_at: int | None = None
        self._lock = asyncio.Lock()

    async def read(
        self,
        signature: str,
        outputs: list[str],
        types: list[str] | None = None,
        values: list[Any] | None = None,
    ):
        return await self.chain.call(
            self.address, signature, types or [], values or [], outputs
        )

    async def batch(self, names: dict[str, str]) -> dict[str, Any]:
        # Limit concurrent calls on the shared public RPC.
        results: dict[str, Any] = {}
        items = list(names.items())
        for offset in range(0, len(items), 6):
            group = items[offset : offset + 6]
            values = await asyncio.gather(
                *(self.read(name + "()", [kind]) for name, kind in group)
            )
            results.update(
                (name, value) for (name, _), value in zip(group, values, strict=True)
            )
        return results

    async def poll(self) -> None:
        async with self._lock:
            await self._poll()

    async def _poll(self) -> None:
        if not self.address:
            return
        try:
            await self.chain.poll()
            if not self.chain.network.connected:
                raise ValueError("chain unavailable")
            identity = await self.batch(
                {
                    "asset": "address",
                    "token": "address",
                    "methodology": "bytes32",
                    "feeFreeThreshold": "uint256",
                }
            )
            config = self.chain.settings
            decimals = await self.chain.call(
                config.token_address, "decimals()", [], [], ["uint8"]
            )
            if (
                identity["asset"].lower() != config.usdg_address.lower()
                or identity["token"].lower() != config.token_address.lower()
                or identity["methodology"] != keccak(text=METHOD)
                or identity["feeFreeThreshold"] != 5000 * 10**decimals
            ):
                raise ValueError("contract configuration mismatch")
            fields = {
                name: "uint256"
                for name in [
                    "openAt",
                    "expiry",
                    "baseRentalPrice",
                    "currentIndex",
                    "callPremium",
                    "putPremium",
                    "quoteValidUntil",
                    "observationTime",
                    "accountedAssets",
                    "reserved",
                    "available",
                    "totalShares",
                    "finalIndex",
                    "positionCount",
                ]
            }
            fields.update({name: "bool" for name in ["settled", "cancelled", "paused"]})
            state = await self.batch(fields)
            balance = await self.chain.call(
                config.usdg_address,
                "balanceOf(address)",
                ["address"],
                [self.address],
                ["uint256"],
            )
            if (
                balance < state["accountedAssets"]
                or state["reserved"] > state["accountedAssets"]
            ):
                raise ValueError("Contract balance does not cover its accounting")
            at = int(time.time())
            phase = (
                "cancelled"
                if state["cancelled"]
                else "settled"
                if state["settled"]
                else "funding"
                if at < state["openAt"]
                else "settling"
                if at >= state["expiry"] - 300
                else "open"
            )
            series = Series(
                address=self.address,
                asset="h100-sxm",
                open_at=state["openAt"],
                expiry=state["expiry"],
                base_price=state["baseRentalPrice"] / 1e8,
                current_index=state["currentIndex"] / 1e6,
                call_premium=stable(state["callPremium"]),
                put_premium=stable(state["putPremium"]),
                quote_valid_until=state["quoteValidUntil"],
                observation_time=state["observationTime"],
                funded=stable(state["accountedAssets"]),
                reserved=stable(state["reserved"]),
                available=stable(state["available"]),
                total_shares=stable(state["totalShares"]),
                final_index=state["finalIndex"] / 1e6,
                settled=state["settled"],
                cancelled=state["cancelled"],
                paused=state["paused"],
                position_count=state["positionCount"],
                phase=phase,
            )
            self.snapshot = Protocol(
                address=self.address,
                verified=True,
                funded=series.funded,
                reserved=series.reserved,
                available=series.available,
                status=phase,
                token_configured=True,
                funding_enabled=config.trading_enabled
                and phase == "funding"
                and not state["paused"],
                contracts=[series],
                activity=self.snapshot.activity,
                checked_at=now(),
            )
        except Exception:
            # Old contract data may remain visible but never executable.
            self.snapshot.verified = False
            self.snapshot.status = "verification_unavailable"
            self.snapshot.index_synced = False
            self.snapshot.checked_at = now()
            return
        try:
            await self.index()
        except Exception:
            self.snapshot.index_synced = False

    async def index(self) -> None:
        start = self.chain.settings.market_start_block
        if start <= 0:
            return
        key = "cursor:" + self.address.lower()
        cursor = self.store.state(key, start - 1)
        head = max(start - 1, (self.chain.network.block or start) - 16)
        stop = min(cursor + 5000, head)
        if stop > cursor:
            logs = await self.chain.rpc(
                "eth_getLogs",
                [
                    {
                        "address": self.address,
                        "fromBlock": hex(cursor + 1),
                        "toBlock": hex(stop),
                    }
                ],
            )
            for entry in logs:
                block = await self.chain.rpc(
                    "eth_getBlockByHash", [entry["blockHash"], False]
                )
                payload = self.decode_event(entry, int(block["timestamp"], 16))
                if payload:
                    self.store.event(
                        payload["tx"], payload["log_index"], payload["block"], payload
                    )
            self.store.set_state(key, stop)
            cursor = stop
        events = [
            e
            for e in self.store.events()
            if e.get("contract", "").lower() == self.address.lower()
        ]
        self.positions = {}
        for event in events:
            if event["kind"] == "Bought":
                self.positions[event["position_id"]] = {**event, "claimed": False}
            elif event["kind"] == "Claimed" and event["position_id"] in self.positions:
                self.positions[event["position_id"]]["claimed"] = True
            elif event["kind"] == "Finalized":
                self.finalized_at = event["timestamp"]
        self.snapshot.activity = [
            TradeEvent.model_validate(e) for e in reversed(events[-50:])
        ]
        self.snapshot.indexed_block = cursor
        self.snapshot.index_synced = cursor >= head

    def decode_event(
        self, entry: dict[str, Any], timestamp: int
    ) -> dict[str, Any] | None:
        signatures = {
            "Funded(address,uint256)": ("Funded", ["uint256"]),
            "Withdrawn(address,uint256,uint256)": ("Withdrawn", ["uint256", "uint256"]),
            "Bought(uint256,address,bool,uint256,uint256,uint256,uint256)": (
                "Bought",
                ["bool", "uint256", "uint256", "uint256", "uint256"],
            ),
            "Claimed(uint256,address,uint256)": ("Claimed", ["uint256"]),
            "Finalized(uint256,uint256)": ("Finalized", ["uint256", "uint256"]),
            "Cancelled(bytes32)": ("Cancelled", ["bytes32"]),
        }
        for signature, (kind, types) in signatures.items():
            if entry["topics"][0].lower() != "0x" + keccak(text=signature).hex():
                continue
            decoded = decode(types, bytes.fromhex(entry["data"][2:]))
            event: dict[str, Any] = {
                "contract": self.address,
                "tx": entry["transactionHash"],
                "log_index": int(entry["logIndex"], 16),
                "block": int(entry["blockNumber"], 16),
                "timestamp": timestamp,
                "kind": kind,
            }
            if kind in ("Funded", "Withdrawn"):
                event.update(
                    wallet="0x" + entry["topics"][1][-40:], amount=stable(decoded[0])
                )
            if kind in ("Bought", "Claimed"):
                event.update(
                    position_id=int(entry["topics"][1], 16),
                    wallet="0x" + entry["topics"][2][-40:],
                )
            if kind == "Bought":
                event.update(
                    is_call=decoded[0],
                    units_raw=decoded[1],
                    cost_raw=decoded[2] + decoded[3],
                    cap_raw=decoded[4],
                    amount=stable(decoded[2] + decoded[3]),
                )
            if kind == "Claimed":
                event["amount"] = stable(decoded[0])
            return event
        return None

    def position(self, row: dict[str, Any]) -> PositionView:
        series = self.snapshot.contracts[0] if self.snapshot.contracts else None
        due = None
        if series and series.cancelled:
            due = row["cost_raw"]
        elif series and series.settled:
            points = max(
                0,
                (round(series.final_index * 1e6) - 100_000_000)
                * (1 if row["is_call"] else -1),
            )
            due = row["units_raw"] * min(10_000_000, points) // 1_000_000
        return PositionView(
            id=row["position_id"],
            buyer=row["wallet"],
            side="call" if row["is_call"] else "put",
            units=stable(row["units_raw"]),
            cost=stable(row["cost_raw"]),
            cap=stable(row["cap_raw"]),
            claimed=row["claimed"],
            claimable=stable(due) if due is not None and not row["claimed"] else None,
            profit=stable(due - row["cost_raw"]) if due is not None else None,
            tx=row["tx"],
            opened_at=row["timestamp"],
        )

    async def portfolio(self, address: str) -> Portfolio:
        if not ADDRESS.fullmatch(address):
            raise ValueError("Invalid wallet address")
        result = Portfolio(
            positions=[
                self.position(p)
                for p in self.positions.values()
                if p["wallet"].lower() == address.lower()
            ],
            index_synced=self.snapshot.index_synced,
        )
        if self.snapshot.verified:
            shares = await self.read(
                "shares(address)", ["uint256"], ["address"], [address]
            )
            result.writer_shares = stable(shares)
            series = self.snapshot.contracts[0]
            if (
                series.phase in ("funding", "settled", "cancelled")
                and Decimal(series.total_shares) > 0
            ):
                result.withdrawable = stable(
                    int(
                        Decimal(series.available)
                        * 1_000_000
                        * Decimal(result.writer_shares)
                        / Decimal(series.total_shares)
                    )
                )
        return result

    async def quote(self, request: QuoteRequest) -> Quote | None:
        if (
            not self.chain.settings.trading_enabled
            or not self.snapshot.verified
            or not self.snapshot.contracts
            or request.market != "h100-sxm"
            or not request.address
        ):
            return None
        series = self.snapshot.contracts[0]
        at = int(time.time())
        if (
            series.phase != "open"
            or series.paused
            or series.quote_valid_until <= at + 15
            or at - series.observation_time > 10800
        ):
            return None
        access = await self.chain.access(request.address)
        if not access.verified or not access.holder:
            return None
        unit_premium = Decimal(
            series.call_premium if request.side == "call" else series.put_premium
        )
        if unit_premium <= 0:
            return None
        units = int(request.premium / unit_premium * 1_000_000)
        premium, fee, cap = await self.read(
            "quote(address,bool,uint256)",
            ["uint256", "uint256", "uint256"],
            ["address", "bool", "uint256"],
            [request.address, request.side == "call", units],
        )
        if not 1000 <= units <= 10**12 or Decimal(series.available) * 1_000_000 < max(
            cap, premium + fee
        ):
            return None
        direction = Decimal(1 if request.side == "call" else -1)
        break_pct = Decimal(premium + fee) / units * direction
        due = int(
            Decimal(units)
            * min(Decimal(10), max(Decimal(0), request.move_pct * direction))
        )
        return Quote(
            indicative=False,
            premium=stable(premium),
            fee=stable(fee),
            cost=stable(premium + fee),
            max_loss=stable(premium + fee),
            max_payout=stable(cap),
            payout=stable(due),
            profit=stable(due - premium - fee),
            breakeven=str(Decimal(str(series.base_price)) * (1 + break_pct / 100)),
            breakeven_pct=str(break_pct),
            reference_price=str(series.base_price),
            collateral_required=stable(cap),
            fee_bps=access.fee_bps,
            reason="Verified series quote. Your wallet transaction enforces the price limit and reserve check.",
            units_raw=str(units),
            cost_raw=str(premium + fee),
            contract_address=self.address,
            deadline=min(at + 60, series.quote_valid_until),
            expiry=series.expiry,
        )

    def leaderboard(self, period: str) -> Leaderboard:
        cutoff = time.time() - {"24h": 86400, "7d": 604800, "30d": 2592000}[period]
        if (
            not self.snapshot.index_synced
            or not self.finalized_at
            or self.finalized_at < cutoff
        ):
            return Leaderboard(period=period, status="awaiting_first_settlement")
        rows: dict[str, dict[str, Any]] = defaultdict(
            lambda: {"trades": 0, "wins": 0, "pnl": Decimal(0)}
        )
        for row in self.positions.values():
            position = self.position(row)
            if position.profit is None:
                continue
            summary = rows[position.buyer]
            summary["trades"] += 1
            summary["wins"] += int(Decimal(position.profit) > 0)
            summary["pnl"] += Decimal(position.profit)
        ranked = sorted(rows.items(), key=lambda item: item[1]["pnl"], reverse=True)[
            :100
        ]
        return Leaderboard(
            period=period,
            status="active",
            rows=[
                LeaderRow(
                    wallet=wallet,
                    trades=row["trades"],
                    wins=row["wins"],
                    pnl=str(row["pnl"]),
                )
                for wallet, row in ranked
            ],
        )
