from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest


@pytest.mark.asyncio
async def test_quote_traffic_does_not_block_transaction_confirmation(
    api_module, monkeypatch
):
    status = AsyncMock(return_value={"confirmed": True, "failed": False})
    monkeypatch.setattr(api_module.transactions, "status", status)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=api_module.app), base_url="http://test"
    ) as client:
        for _ in range(60):
            assert (await client.post("/api/v1/quote", json={})).status_code == 200
        assert (await client.post("/api/v1/quote", json={})).status_code == 429
        confirmed = await client.get("/api/v1/transactions/test-signature")
        assert confirmed.status_code == 200
        assert confirmed.json()["confirmed"]


@pytest.mark.asyncio
async def test_rpc_node_error_is_retryable_during_confirmation(api_module, monkeypatch):
    client_type = httpx.AsyncClient
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "error": {"code": -32005, "message": "Node is behind"},
            },
        )
    )
    async with client_type(
        transport=httpx.ASGITransport(app=api_module.app), base_url="http://test"
    ) as client:
        monkeypatch.setattr(
            "app.chain.httpx.AsyncClient",
            lambda **kwargs: client_type(transport=transport, **kwargs),
        )
        response = await client.get("/api/v1/transactions/0x" + "1" * 64)
        assert response.status_code == 503
        assert (
            response.json()["detail"]
            == "Robinhood confirmation is temporarily unavailable"
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("source_offset", [-4, 1])
async def test_benchmark_must_still_be_fresh_before_a_buy_review(
    api_module, monkeypatch, source_offset
):
    market = api_module.data.markets["h100-sxm"]
    market.stale = False
    market.source_updated_at = (
        datetime.now(UTC) + timedelta(hours=source_offset)
    ).isoformat()
    wallet = "0x" + "1" * 40
    review = AsyncMock(
        return_value={
            "chain_id": 4663,
            "wallet": wallet,
            "action": "claim",
            "to": "0x" + "2" * 40,
            "data": "0x1234",
            "expires_at": 2000000000,
        }
    )
    monkeypatch.setattr(api_module.transactions, "review", review)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=api_module.app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/transactions/review", json={"action": "buy", "wallet": wallet}
        )
        assert response.status_code == 409
        review.assert_not_awaited()
        response = await client.post(
            "/api/v1/transactions/review",
            json={"action": "claim", "wallet": wallet, "position_id": 0},
        )
        assert response.status_code == 200
        review.assert_awaited_once()


@pytest.mark.asyncio
async def test_public_configuration_is_robinhood_and_funding_stays_disabled(api_module):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=api_module.app), base_url="http://test"
    ) as client:
        config = (await client.get("/api/v1/config")).json()
        assert config["chain_id"] == 4663
        assert (
            config["usdg_address"].lower()
            == "0x5fc5360d0400a0fd4f2af552add042d716f1d168"
        )
        assert not config["trading_enabled"]
        assert "cluster" not in config
        response = await client.post(
            "/api/v1/transactions/review",
            json={"action": "fund", "wallet": "0x" + "1" * 40, "amount_raw": "1000000"},
        )
        assert response.status_code == 409
