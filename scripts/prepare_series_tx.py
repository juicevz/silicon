"""Prepare an unsigned publisher transaction from archived observations.

No keys are read and no transaction is signed or broadcast. The returned calldata
can be reviewed and submitted by the separately authorized publisher wallet.
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import httpx
from eth_abi import encode
from eth_utils import keccak

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.chain import Chain  # noqa: E402
from app.config import Settings  # noqa: E402


async def prepare(args):
    config = Settings(_env_file=None, rpc_url=args.rpc, market_address=args.contract)
    chain = Chain(config)
    await chain.poll()
    if not chain.network.connected:
        raise ValueError("The expected Robinhood chain could not be verified")
    block = await chain.rpc("eth_getBlockByNumber", ["latest", False])
    at = int(block["timestamp"], 16)

    def call(signature: str, kind: str):
        return chain.call(args.contract, signature, [], [], [kind])

    publisher, expiry, base = await asyncio.gather(
        call("publisher()", "address"),
        call("expiry()", "uint64"),
        call("baseRentalPrice()", "uint256"),
    )
    receipt_hash = None
    if args.mode in ("quote", "propose"):
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                args.api.rstrip("/") + "/api/v1/receipts", params={"market": "h100-sxm"}
            )
            response.raise_for_status()
            observations = response.json()["receipts"]
        candidates = []
        for row in observations:
            receipt = row["receipt"]
            digest = (
                "0x"
                + keccak(
                    text=json.dumps(receipt, sort_keys=True, separators=(",", ":"))
                ).hex()
            )
            if (
                row["hash"] != digest
                or receipt["methodology"] != "silicon-h100-v1"
                or len(receipt["constituents"]) != 5
            ):
                continue
            timestamp = int(
                datetime.fromisoformat(receipt["source_updated_at"]).timestamp()
            )
            if (
                args.mode == "quote"
                and 0 <= at - timestamp <= 10800
                or args.mode == "propose"
                and expiry <= timestamp <= min(expiry + 10800, at)
            ):
                candidates.append((timestamp, row))
        if not candidates:
            raise ValueError(
                "No eligible archived observation is available; do not publish a replacement"
            )
        observed, row = (
            max(candidates, key=lambda x: x[0])
            if args.mode == "quote"
            else min(candidates, key=lambda x: x[0])
        )
        receipt_hash = row["hash"]
        index = int(Decimal(row["receipt"]["price"]) * 10**8 / base * 100_000_000)
        if args.mode == "quote":
            if args.call_premium is None or args.put_premium is None:
                raise ValueError(
                    "Writer-approved call and put premiums must be supplied explicitly"
                )
            premiums = [
                int(Decimal(value) * 1_000_000)
                for value in (args.call_premium, args.put_premium)
            ]
            signature, types, values = (
                "setQuote(uint256,uint64,uint256,uint256,uint64)",
                ["uint256", "uint64", "uint256", "uint256", "uint64"],
                [index, observed, *premiums, at + 600],
            )
        else:
            signature, types, values = (
                "proposeResult(uint256,uint64,bytes32)",
                ["uint256", "uint64", "bytes32"],
                [index, observed, bytes.fromhex(receipt_hash[2:])],
            )
    else:
        signature, types, values = (
            ("finalize()" if args.mode == "finalize" else "cancelTimedOut()"),
            [],
            [],
        )
    data = "0x" + (keccak(text=signature)[:4] + encode(types, values)).hex()
    transaction = {"from": publisher, "to": args.contract, "data": data, "value": "0x0"}
    # Simulate from the correct role before producing a reviewable transaction.
    await chain.rpc("eth_call", [transaction, "latest"])
    gas = await chain.rpc("eth_estimateGas", [transaction])
    print(
        json.dumps(
            {
                "chain_id": config.chain_id,
                "action": args.mode,
                "transaction": transaction,
                "estimated_gas": int(gas, 16),
                "receipt": args.api.rstrip("/") + "/api/v1/receipts/" + receipt_hash
                if receipt_hash
                else None,
                "signed": False,
                "broadcast": False,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode", choices=["quote", "propose", "finalize", "timeout"], required=True
    )
    parser.add_argument("--contract", required=True)
    parser.add_argument("--api", default="https://siliconmarkets.io")
    parser.add_argument("--rpc", default="https://rpc.mainnet.chain.robinhood.com/")
    parser.add_argument("--call-premium")
    parser.add_argument("--put-premium")
    asyncio.run(prepare(parser.parse_args()))
