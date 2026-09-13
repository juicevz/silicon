from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class Point(BaseModel):
    time: str
    price: float
    index: float


class ProviderQuote(BaseModel):
    id: str
    provider: str
    price: float
    region: str | None = None
    instance: str | None = None
    scope: str
    source_url: str
    updated_at: str
    included: bool = False


class Market(BaseModel):
    id: str
    name: str
    architecture: str
    memory: str
    color: str
    price: float | None = None
    index: float | None = None
    baseline: float | None = None
    source_updated_at: str | None = None
    collected_at: str | None = None
    history_since: str | None = None
    stale: bool = True
    coverage: int = 0
    quote_count: int = 0
    required_providers: int = 0
    status: Literal["collecting", "tracking", "benchmark", "withheld"] = "collecting"
    changes: dict[str, float | None] = Field(default_factory=dict)
    history: list[Point] = Field(default_factory=list)
    providers: list[ProviderQuote] = Field(default_factory=list)


class Network(BaseModel):
    connected: bool = False
    block: int | None = None
    latency_ms: int | None = None
    checked_at: str | None = None
    chain_id: int = 4663
    error: str | None = None


class Snapshot(BaseModel):
    markets: list[Market]
    network: Network
    server_time: str
    collection_interval: int
    data_source: str = "GPU Economy"
    source_url: str = "https://gpueconomy.com/data"
    license: str = "CC BY 4.0"
    trading_enabled: bool = False


class PublicConfig(BaseModel):
    privy_app_id: str
    chain_id: int
    explorer_url: str
    token_address: str | None
    market_address: str | None
    usdg_address: str
    fee_bps: int
    fee_free_above: str = "5000"
    trading_enabled: bool


class Access(BaseModel):
    address: str
    usdg: str | None = None
    eth: str | None = None
    token_balance: str | None = None
    holder: bool = False
    fee_free: bool = False
    fee_bps: int = 100
    advanced: bool = False
    token_configured: bool = False
    verified: bool = False
    checked_at: str
    error: str | None = None


class QuoteRequest(BaseModel):
    market: Literal["h100-sxm", "a100-80", "b200"] = "h100-sxm"
    side: Literal["call", "put"] = "call"
    premium: Decimal = Field(default=Decimal("2"), ge=Decimal("0.1"), le=Decimal("300"))
    move_pct: Decimal = Field(default=Decimal("4"), ge=Decimal("-50"), le=Decimal("50"))
    address: str | None = None


class Quote(BaseModel):
    indicative: bool = True
    premium: str
    fee: str
    cost: str
    max_loss: str
    max_payout: str
    payout: str
    profit: str
    breakeven: str | None
    breakeven_pct: str
    reference_price: str | None
    collateral_required: str
    fee_bps: int
    reason: str
    units_raw: str | None = None
    cost_raw: str | None = None
    contract_address: str | None = None
    deadline: int | None = None
    expiry: int | None = None


class Series(BaseModel):
    address: str
    asset: str
    open_at: int
    expiry: int
    base_price: float
    current_index: float
    call_premium: str
    put_premium: str
    quote_valid_until: int
    observation_time: int
    funded: str
    reserved: str
    available: str
    total_shares: str
    final_index: float
    settled: bool
    cancelled: bool
    paused: bool
    position_count: int
    phase: str


class TradeEvent(BaseModel):
    tx: str
    log_index: int
    block: int
    timestamp: int
    kind: str
    wallet: str | None = None
    position_id: int | None = None
    amount: str | None = None


class PositionView(BaseModel):
    id: int
    buyer: str
    side: str
    units: str
    cost: str
    cap: str
    claimed: bool
    claimable: str | None
    profit: str | None
    tx: str
    opened_at: int


class Portfolio(BaseModel):
    positions: list[PositionView] = Field(default_factory=list)
    writer_shares: str = "0"
    withdrawable: str = "0"
    index_synced: bool = False


class LeaderRow(BaseModel):
    wallet: str
    trades: int
    wins: int
    pnl: str


class Leaderboard(BaseModel):
    period: str
    rows: list[LeaderRow] = Field(default_factory=list)
    status: str


class Protocol(BaseModel):
    address: str | None = None
    verified: bool = False
    funded: str = "0"
    reserved: str = "0"
    available: str = "0"
    status: str = "awaiting_deployment"
    token_configured: bool = False
    contracts: list[Series] = Field(default_factory=list)
    activity: list[TradeEvent] = Field(default_factory=list)
    checked_at: str | None = None
    index_synced: bool = False
    indexed_block: int | None = None
