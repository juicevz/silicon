from datetime import UTC, datetime, timedelta
from time import time

import httpx
import pytest

from app.config import Settings
from app.insights import market_context, vault_accounting
from app.models import Market, Protocol, Series
from app.store import Store
from app.strategies import PaperRequest, Strategies


ADDRESS = "0x" + "1" * 40


def snapshot(**changes):
    fields = dict(address=ADDRESS, asset="h100-sxm", open_at=1, expiry=int(time()) + 86400,
                  base_price=4, current_index=100, call_premium="2", put_premium="2",
                  quote_valid_until=int(time()) + 60, observation_time=int(time()), funded="65",
                  reserved="15", available="50", total_shares="75", final_index=103,
                  settled=True, cancelled=False, paused=False, position_count=1, phase="settled")
    fields.update(changes)
    return Protocol(address=ADDRESS, verified=True, index_synced=True, indexed_block=100,
                    contracts=[Series(**fields)])


def ledger(store, address=ADDRESS):
    for i, (kind, amount) in enumerate([("Funded", "100"), ("Bought", "20"), ("Claimed", "30"), ("Withdrawn", "25")]):
        store.event("0x" + str(i) * 64, i, i + 1, {"contract": address, "kind": kind, "amount": amount})


def test_final_provider_result_reserves_unclaimed_payouts_and_isolates_rounds(tmp_path):
    store = Store(tmp_path)
    ledger(store)
    store.event("other", 99, 99, {"contract": "0x" + "2" * 40, "kind": "Funded", "amount": "9000"})
    result = vault_accounting(snapshot(), store)
    assert result.reconciled
    assert result.deposits == "100" and result.premiums_and_fees == "20"
    assert result.final_provider_result == "-25"  # 25 withdrawn + 50 residual equity - 100 deposited
    assert result.reserved == "15" and result.buyer_payments == "30"
    store.close()


def test_accounting_withholds_incomplete_unverified_or_unreconciled_results(tmp_path):
    store = Store(tmp_path)
    ledger(store)
    state = snapshot()
    state.index_synced = False
    result = vault_accounting(state, store)
    assert result.deposits is None and result.final_provider_result is None
    state.index_synced = True
    state.verified = False
    result = vault_accounting(state, store)
    assert result.assets is None and result.available is None and result.final_provider_result is None
    state.verified = True
    state.contracts[0].funded = "66"
    result = vault_accounting(state, store)
    assert not result.reconciled and result.final_provider_result is None
    state.contracts[0].funded = "65"
    state.contracts[0].phase = "open"
    result = vault_accounting(state, store)
    assert result.reconciled and result.final_provider_result is None
    assert result.withdrawal_status.startswith("Locked")
    store.close()


def test_readiness_and_comparison_status_never_invent_live_markets(tmp_path):
    store = Store(tmp_path)
    settings = Settings(_env_file=None, rpc_url="http://127.0.0.1:8545", trading_enabled=True, token_address=ADDRESS)
    market = Market(id="h100-sxm", name="H100", architecture="Hopper", memory="80 GB", color="orange",
                    stale=False, source_updated_at=datetime.now(UTC).isoformat())
    state = snapshot(phase="open", settled=False)
    assert market_context(market, state, settings, store).ready
    market.id = "b200"
    context = market_context(market, state, settings, store)
    assert not context.ready and context.mode == "comparison" and not context.contracts
    market.id = "h100-sxm"
    market.source_updated_at = (datetime.now(UTC) - timedelta(hours=4)).isoformat()
    state.contracts[0].paused = True
    state.contracts[0].available = "0"
    context = market_context(market, state, settings, store)
    assert not context.ready and len(context.reasons) == 3
    store.close()


def test_paper_retries_keep_original_entry_and_thesis(tmp_path):
    store = Store(tmp_path)
    strategies = Strategies(store)
    at = datetime.now(UTC)
    store.record("h100-sxm", at.isoformat(), "4", "100", {"providers": []})
    request = PaperRequest(thesis="  New supply reduces rental prices.  ", request_id="test-request-123456")
    first = strategies.create("owner", request, at)
    later = at + timedelta(hours=1)
    store.record("h100-sxm", later.isoformat(), "3.8", "95", {"providers": []})
    repeated = strategies.create("owner", request, later)
    assert repeated == first
    assert first.thesis == "New supply reduces rental prices."
    assert len(strategies.book("owner", later).records) == 1
    assert strategies.create("another-owner", request, later).id != first.id
    with pytest.raises(ValueError, match="different entry terms"):
        strategies.create("owner", request.model_copy(update={"side": "call"}), later)
    store.close()


@pytest.mark.asyncio
async def test_context_and_accounting_routes_fail_closed(api_module):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api_module.app), base_url="http://test") as client:
        response = await client.get("/api/v1/markets/b200/context")
        assert response.status_code == 200
        assert response.json()["mode"] == "comparison" and not response.json()["ready"]
        assert (await client.get("/api/v1/markets/unlisted/context")).status_code == 422
        assert (await client.get(f"/api/v1/vaults/{ADDRESS}/accounting")).status_code == 404
