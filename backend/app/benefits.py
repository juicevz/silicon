"""Optional wallet benefits and observed fee savings, independent of trade access."""

from .chain import Chain
from .models import Benefits
from .protocol import ProtocolReader, stable


async def wallet_benefits(chain: Chain, readers: list[ProtocolReader], address: str) -> Benefits:
    access = await chain.access(address)
    rounds = {r.address.lower(): r for r in readers if r.address}
    complete = bool(rounds) and all(r.snapshot.verified and r.snapshot.index_synced for r in rounds.values())
    savings, trades = 0, 0
    for reader in rounds.values():
        if reader.snapshot.contracts and reader.snapshot.contracts[0].cancelled:
            continue
        for position in reader.positions.values():
            if position["wallet"].lower() != address.lower():
                continue
            if "premium_raw" not in position or "fee_raw" not in position:
                complete = False
                continue
            trades += 1
            savings += max(0, position["premium_raw"] * 100 // 10000 - position["fee_raw"])
    return Benefits(access=access, recorded_savings=stable(savings) if complete else None,
                    recorded_trades=trades, history_complete=complete,
                    scope="Fees waived at purchase in configured rounds. Cancelled rounds are excluded.")
