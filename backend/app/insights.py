"""Read-only market context and round accounting, backed by source and chain records."""

from decimal import Decimal
from time import time
from typing import Literal

from pydantic import BaseModel, Field

from .config import Settings
from .market_data import age
from .models import Market, Protocol, Series
from .store import Store


class MarketContext(BaseModel):
    market: str
    mode: Literal["benchmark", "comparison"]
    ready: bool
    contract_verified: bool
    reasons: list[str]
    source_fresh: bool
    source_updated_at: str | None
    contracts: list[Series]
    methodology: str
    exclusions: list[str]
    receipt_hash: str | None = None
    receipt_time: str | None = None


def market_context(market: Market, protocol: Protocol, settings: Settings, store: Store) -> MarketContext:
    benchmark = market.id == "h100-sxm"
    fresh = not market.stale and -300 <= age(market.source_updated_at) <= settings.source_stale_seconds
    contracts = protocol.contracts if benchmark else []
    reasons = []
    if not benchmark:
        reasons.append("This GPU is a comparison reference. It has no live trading contract.")
    else:
        if not settings.trading_enabled:
            reasons.append("Live execution is not enabled.")
        if not contracts:
            reasons.append("No verified H100 series is available.")
        if not protocol.verified:
            reasons.append("Contract verification is unavailable.")
        if contracts:
            series = contracts[0]
            if series.phase != "open":
                reasons.append(f"The current series is {series.phase}.")
            if series.paused:
                reasons.append("The series is paused.")
            if series.quote_valid_until <= time():
                reasons.append("The contract needs a fresh premium quote.")
            if Decimal(series.available) <= 0:
                reasons.append("No collateral capacity is available for a new position.")
    if not fresh:
        reasons.append("The rental reference needs a fresh source observation.")
    receipts = store.receipts(market.id)
    latest = receipts[0] if receipts else None
    return MarketContext(
        market=market.id, mode="benchmark" if benchmark else "comparison", ready=not reasons,
        reasons=reasons, contract_verified=benchmark and protocol.verified, source_fresh=fresh, source_updated_at=market.source_updated_at,
        contracts=contracts,
        methodology=("Median of five fixed providers, normalized per GPU-hour. All five must be confirmed within three hours."
                     if benchmark else "Median of each provider's cheapest eligible listing, with at least three providers. Used for comparison only."),
        exclusions=["Spot and reserved offers", "Non-USD prices", "GPU-only and marketplace floor prices", "Unconfirmed or stale quotes",
                    "Listings outside the fixed H100 basket" if benchmark else "Additional listings from the same provider"],
        receipt_hash=latest["hash"] if latest else None,
        receipt_time=latest["receipt"]["source_updated_at"] if latest else None,
    )


class VaultAccounting(BaseModel):
    address: str
    verified: bool
    index_synced: bool
    indexed_block: int | None
    checked_at: str | None
    phase: str
    assets: str | None
    reserved: str | None
    available: str | None
    deposits: str | None
    withdrawals: str | None
    premiums_and_fees: str | None
    buyer_payments: str | None
    reconciled: bool
    final_provider_result: str | None
    withdrawal_status: str
    notes: list[str] = Field(default_factory=list)


def vault_accounting(protocol: Protocol, store: Store) -> VaultAccounting:
    series = protocol.contracts[0] if protocol.contracts else None
    verified = protocol.verified and series is not None
    indexed = protocol.index_synced and protocol.indexed_block is not None
    totals = {key: Decimal(0) for key in ("Funded", "Withdrawn", "Bought", "Claimed")}
    if indexed:
        for event in store.events():
            if event.get("contract", "").lower() == (protocol.address or "").lower() and event["kind"] in totals:
                totals[event["kind"]] += Decimal(event.get("amount") or "0")
    assets = Decimal(series.funded) if verified else None
    available = Decimal(series.available) if verified else None
    expected = totals["Funded"] + totals["Bought"] - totals["Withdrawn"] - totals["Claimed"]
    reconciled = bool(indexed and verified and assets == expected)
    phase = series.phase if series else "unavailable"
    final = phase in ("settled", "cancelled")
    notes = ["Premiums and fees stay in this round. Buyer payments include cancellation refunds."]
    if not verified:
        notes.append("Current balances cannot be verified. Historical totals do not establish available backing.")
    if not indexed:
        notes.append("The event history is still syncing. Cumulative totals are withheld.")
    elif not reconciled:
        notes.append("Indexed transfers and the latest balance do not yet reconcile. Final performance is withheld.")
    return VaultAccounting(
        address=protocol.address or "", verified=verified, index_synced=protocol.index_synced,
        indexed_block=protocol.indexed_block, checked_at=protocol.checked_at, phase=phase,
        assets=str(assets) if assets is not None else None,
        reserved=series.reserved if verified else None,
        available=str(available) if available is not None else None,
        deposits=str(totals["Funded"]) if indexed else None,
        withdrawals=str(totals["Withdrawn"]) if indexed else None,
        premiums_and_fees=str(totals["Bought"]) if indexed else None,
        buyer_payments=str(totals["Claimed"]) if indexed else None,
        reconciled=reconciled,
        final_provider_result=str(totals["Withdrawn"] + available - totals["Funded"]) if final and reconciled else None,
        withdrawal_status=("Verification unavailable" if not verified else "Withdrawals open" if phase in ("funding", "settled", "cancelled") else "Locked until settlement or cancellation"),
        notes=notes,
    )
