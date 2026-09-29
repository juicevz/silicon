from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.benefits import wallet_benefits
from app.chain import Chain
from app.config import Settings
from app.models import Access, Protocol

WALLET = "0x" + "1" * 40
TOKEN = "0x" + "2" * 40


@pytest.mark.asyncio
@pytest.mark.parametrize("balance,eligible", [(0, False), (5000 * 10**18, False), (5000 * 10**18 + 1, True)])
async def test_nonholders_keep_verified_collateral_and_only_qualified_balances_get_benefits(balance, eligible):
    chain = Chain(Settings(_env_file=None, token_address=TOKEN))
    chain.rpc = AsyncMock(side_effect=lambda method, _: hex(4663) if method == "eth_chainId" else "0x1")

    async def call(address, signature, *args):
        if signature == "decimals()":
            return 18 if address.lower() == TOKEN.lower() else 6
        return balance if address.lower() == TOKEN.lower() else 20_000_000

    chain.call = call
    access = await chain.access(WALLET)
    assert access.verified and access.advanced and access.usdg == "20"
    assert access.fee_free == access.workflow_benefits == eligible
    assert access.fee_bps == (0 if eligible else 100)
    assert access.alert_limit == (100 if eligible else 20)


@pytest.mark.asyncio
@pytest.mark.parametrize("configured", [False, True])
async def test_missing_or_unreadable_benefits_token_does_not_break_collateral_access(configured):
    chain = Chain(Settings(_env_file=None, token_address=TOKEN if configured else ""))
    chain.rpc = AsyncMock(side_effect=lambda method, _: hex(4663) if method == "eth_chainId" else "0x1")

    async def call(address, signature, *args):
        if address.lower() == TOKEN.lower():
            raise RuntimeError("Token read unavailable")
        return 6 if signature == "decimals()" else 150_000_000

    chain.call = call
    access = await chain.access(WALLET)
    assert access.verified and access.usdg == "150" and access.error is None
    assert not access.workflow_benefits and access.fee_bps == 100
    assert bool(access.benefits_error) == configured


@pytest.mark.asyncio
async def test_savings_use_actual_events_rounding_and_unique_rounds():
    chain = SimpleNamespace(access=AsyncMock(return_value=Access(address=WALLET, checked_at="now")))
    reader = SimpleNamespace(address=TOKEN, snapshot=Protocol(verified=True, index_synced=True), positions={
        0: {"wallet": WALLET, "premium_raw": 2_000_099, "fee_raw": 0},
        1: {"wallet": WALLET, "premium_raw": 2_000_000, "fee_raw": 20_000},
        2: {"wallet": TOKEN, "premium_raw": 9_000_000, "fee_raw": 0},
    })
    result = await wallet_benefits(chain, [reader, reader], WALLET)
    assert result.recorded_savings == "0.02" and result.recorded_trades == 2
    reader.snapshot.index_synced = False
    assert (await wallet_benefits(chain, [reader], WALLET)).recorded_savings is None
    reader.snapshot.index_synced = True
    reader.snapshot = SimpleNamespace(verified=True, index_synced=True, contracts=[SimpleNamespace(cancelled=True)])
    assert (await wallet_benefits(chain, [reader], WALLET)).recorded_savings == "0"


@pytest.mark.asyncio
async def test_no_market_does_not_fabricate_savings():
    chain = SimpleNamespace(access=AsyncMock(return_value=Access(address=WALLET, checked_at="now")))
    result = await wallet_benefits(chain, [], WALLET)
    assert result.recorded_savings is None and not result.history_complete
