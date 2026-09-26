"""Exercise the actual compiled bytecode and API reader on an isolated local node."""

import json
import shutil
import socket
import subprocess
import time
from pathlib import Path
from types import SimpleNamespace
from datetime import UTC, datetime

import httpx
import pytest
from eth_abi import encode
from eth_utils import keccak

from app.chain import Chain
from app.config import Settings
from app.models import QuoteRequest
from app.protocol import ProtocolReader
from app.store import Store
from app.transactions import Transactions


@pytest.mark.asyncio
async def test_funded_series_reader_quote_portfolio_and_leaderboard(
    tmp_path, monkeypatch, api_module
):
    root = Path(__file__).resolve().parents[2]
    artifact = root / "contracts/out/SiliconSeries.sol/SiliconSeries.json"
    if not shutil.which("anvil") or not artifact.exists():
        pytest.skip(
            "Run forge build and install Foundry for the bytecode integration test"
        )
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen(
        [
            "anvil",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--chain-id",
            "4663",
            "--silent",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    url = f"http://127.0.0.1:{port}"
    client = httpx.Client(timeout=10)

    def rpc(method, params):
        result = client.post(
            url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        ).json()
        assert "error" not in result, result.get("error")
        return result["result"]

    def tx(sender, target, data):
        value = {"from": sender, "data": data, "gas": hex(12_000_000)}
        if target:
            value["to"] = target
        result = rpc("eth_sendTransaction", [value])
        receipt = rpc("eth_getTransactionReceipt", [result])
        for _ in range(100):
            if receipt:
                break
            time.sleep(0.01)
            receipt = rpc("eth_getTransactionReceipt", [result])
        assert receipt["status"] == "0x1"
        return receipt

    def send(sender, target, signature, types, args):
        return tx(
            sender,
            target,
            "0x" + (keccak(text=signature)[:4] + encode(types, args)).hex(),
        )

    def deploy(sender, filename, types, args):
        bytecode = json.loads((root / "contracts/out" / filename).read_text())[
            "bytecode"
        ]["object"]
        return tx(sender, None, bytecode + encode(types, args).hex())

    try:
        for _ in range(50):
            try:
                accounts = rpc("eth_accounts", [])
                break
            except httpx.ConnectError:
                time.sleep(0.05)
        writer, buyer = accounts[:2]
        usd = deploy(writer, "SiliconSeries.t.sol/MockToken.json", ["uint8"], [6])[
            "contractAddress"
        ]
        token = deploy(writer, "SiliconSeries.t.sol/MockToken.json", ["uint8"], [18])[
            "contractAddress"
        ]
        timestamp = int(rpc("eth_getBlockByNumber", ["latest", False])["timestamp"], 16)
        opening, expiry = timestamp + 3600, timestamp + 3600 + 86400
        receipt = deploy(
            writer,
            "SiliconSeries.sol/SiliconSeries.json",
            [
                "address",
                "address",
                "address",
                "address",
                "uint64",
                "uint64",
                "uint256",
                "bytes32",
            ],
            [
                usd,
                token,
                writer,
                writer,
                opening,
                expiry,
                385000000,
                keccak(text="silicon-h100-v1"),
            ],
        )
        address = receipt["contractAddress"]
        config = Settings(
            _env_file=None,
            trading_enabled=True,
            data_dir=tmp_path,
            rpc_url=url,
            usdg_address=usd,
            token_address=token,
            market_address=address,
            market_start_block=int(receipt["blockNumber"], 16),
        )
        store = Store(tmp_path)
        chain = Chain(config)
        reader = ProtocolReader(chain, store)
        clock = SimpleNamespace(
            time=lambda: int(
                rpc("eth_getBlockByNumber", ["latest", False])["timestamp"], 16
            )
        )
        monkeypatch.setattr("app.protocol.time", clock)
        monkeypatch.setattr("app.transactions.time", clock)
        monkeypatch.setattr(api_module, "config", config)
        monkeypatch.setattr(api_module, "chain", chain)
        monkeypatch.setattr(api_module, "reader", reader)
        monkeypatch.setattr(api_module, "transactions", Transactions(chain, reader))
        market = api_module.data.markets["h100-sxm"]
        market.stale = False
        market.source_updated_at = datetime.now(UTC).isoformat()

        async def review(body):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=api_module.app),
                base_url="http://test",
            ) as api:
                return await api.post("/api/v1/transactions/review", json=body)

        async def execute(wallet, action, **kwargs):
            response = await review({"wallet": wallet, "action": action, **kwargs})
            assert response.status_code == 200, response.text
            reviewed = response.json()
            assert reviewed["simulated"] and reviewed["chain_id"] == 4663
            assert reviewed["value"] == "0x0"
            receipt = tx(wallet, reviewed["to"], reviewed["data"])
            rpc("anvil_mine", [2])
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=api_module.app),
                base_url="http://test",
            ) as api:
                status = await api.get(
                    "/api/v1/transactions/" + receipt["transactionHash"]
                )
            assert status.status_code == 200 and status.json()["confirmed"]
            assert not status.json()["failed"]
            return reviewed

        for wallet, token_amount, stable_amount in [
            (writer, 1, 300_000_000),
            (buyer, 5000 * 10**18 + 1, 100_000_000),
        ]:
            send(
                writer,
                token,
                "mint(address,uint256)",
                ["address", "uint256"],
                [wallet, token_amount],
            )
            send(
                writer,
                usd,
                "mint(address,uint256)",
                ["address", "uint256"],
                [wallet, stable_amount],
            )
        await execute(writer, "approve", amount_raw="300000000")
        await execute(writer, "fund", amount_raw="300000000")
        await reader.poll()
        assert reader.snapshot.funding_enabled
        assert reader.snapshot.contracts[0].asset == "h100-sxm"
        rpc("evm_setNextBlockTimestamp", [opening])
        rpc("evm_mine", [])
        send(
            writer,
            address,
            "setQuote(uint256,uint64,uint256,uint256,uint64)",
            ["uint256", "uint64", "uint256", "uint256", "uint64"],
            [100_000_000, opening, 2_000_000, 2_000_000, opening + 600],
        )
        await execute(buyer, "approve", amount_raw="2000000")
        await execute(
            buyer,
            "buy",
            amount_raw="1000000",
            max_total_raw="2000000",
            is_call=True,
            deadline=clock.time() + 60,
        )
        rpc("anvil_mine", [32])
        await chain.poll()
        await reader.poll()
        assert reader.snapshot.verified
        assert reader.snapshot.funded == "302"
        assert reader.snapshot.reserved == "10"
        access = await chain.access(buyer)
        assert access.verified and access.holder and access.fee_free
        quote = await reader.quote(QuoteRequest(address=buyer))
        assert (
            quote
            and not quote.indicative
            and quote.fee == "0"
            and quote.units_raw == "1000000"
        )
        portfolio = await reader.portfolio(buyer)
        assert len(portfolio.positions) == 1 and portfolio.positions[0].cost == "2"
        assert portfolio.index_synced
        rpc("evm_setNextBlockTimestamp", [expiry])
        rpc("evm_mine", [])
        send(
            writer,
            address,
            "proposeResult(uint256,uint64,bytes32)",
            ["uint256", "uint64", "bytes32"],
            [104_000_000, expiry, keccak(text="source receipt")],
        )
        rpc("evm_increaseTime", [3601])
        rpc("evm_mine", [])
        send(writer, address, "finalize()", [], [])
        rpc("anvil_mine", [32])
        await chain.poll()
        await reader.poll()
        portfolio = await reader.portfolio(buyer)
        assert portfolio.positions[0].claimable == "4"
        leaders = reader.leaderboard("7d")
        assert leaders.rows[0].pnl == "2" and leaders.rows[0].wins == 1
        send(
            buyer,
            token,
            "transfer(address,uint256)",
            ["address", "uint256"],
            [writer, 5000 * 10**18 + 1],
        )
        config.trading_enabled = False
        market.stale = True
        wrong_owner = await review(
            {"wallet": writer, "action": "claim", "position_id": 0}
        )
        assert wrong_owner.status_code == 409
        assert "does not belong" in wrong_owner.json()["detail"]
        await execute(buyer, "claim", position_id=0)
        await execute(writer, "withdraw", amount_raw="300000000")
        rpc("anvil_mine", [32])
        await chain.poll()
        await reader.poll()
        assert (await reader.portfolio(buyer)).positions[0].claimed
        assert reader.snapshot.funded == "0"
        assert (await chain.access(buyer)).usdg == "102"
        assert (await chain.access(writer)).usdg == "298"
        # A configured vault round gets its own approval, collateral and
        # redemption path. Arbitrary destinations never reach the wallet.
        next_open = clock.time() + 86400
        next_round = deploy(
            writer, "SiliconPremiumVault.sol/SiliconPremiumVaultRound.json",
            ["address", "address", "address", "address", "uint64", "uint64", "uint256", "uint256"],
            [usd, token, writer, writer, next_open, next_open + 7 * 86400, 385000000, 100_000_000],
        )["contractAddress"]
        round_reader = ProtocolReader(chain, store, next_round)
        rounds = {next_round.lower(): round_reader}
        config.vault_round_addresses = [next_round]
        config.trading_enabled = True
        monkeypatch.setattr(api_module, "round_readers", rounds)
        monkeypatch.setattr(api_module, "transactions", Transactions(chain, reader, rounds))
        rejected = await review({"wallet": writer, "action": "fund", "amount_raw": "1", "series_address": buyer})
        assert rejected.status_code == 409 and "not configured" in rejected.json()["detail"]
        approval = await execute(writer, "approve", amount_raw="50000000", series_address=next_round)
        assert next_round[2:].lower() in approval["data"].lower()
        await execute(writer, "fund", amount_raw="50000000", series_address=next_round)
        await round_reader.poll()
        assert round_reader.snapshot.funded == "50"
        send(writer, next_round, "setPaused(bool)", ["bool"], [True])
        rejected = await review({"wallet": writer, "action": "fund", "amount_raw": "1", "series_address": next_round})
        assert rejected.status_code == 409 and "not open" in rejected.json()["detail"]
        config.trading_enabled = False
        await execute(writer, "withdraw", amount_raw="50000000", series_address=next_round)
        await round_reader.poll()
        assert round_reader.snapshot.funded == "0"
        store.close()
    finally:
        client.close()
        process.terminate()
        process.wait(timeout=10)
