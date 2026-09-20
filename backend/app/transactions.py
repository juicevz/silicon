"""Review EVM calldata and track receipts. Signing stays in the user's wallet."""

import re
import time

from eth_abi import encode
from eth_utils import keccak, to_checksum_address

from .chain import ADDRESS, Chain
from .models import ReviewedTransaction, TransactionRequest
from .protocol import ProtocolReader


class Transactions:
    def __init__(self, chain: Chain, reader: ProtocolReader):
        self.chain, self.reader = chain, reader

    async def review(self, request: TransactionRequest) -> ReviewedTransaction:
        if not ADDRESS.fullmatch(request.wallet):
            raise ValueError("Invalid wallet address")
        config = self.chain.settings
        if request.action in {"buy", "fund", "approve"} and not config.trading_enabled:
            raise ValueError("Funding and trading are not activated")
        await self.chain.verify_chain()
        await self.reader.poll()
        if not config.market_address or not self.reader.snapshot.verified:
            raise ValueError("The Robinhood series could not be verified")
        amount, maximum = int(request.amount_raw), int(request.max_total_raw)
        if amount >= 2**256 or maximum >= 2**256:
            raise ValueError("Amount exceeds contract limits")
        wallet = to_checksum_address(request.wallet)
        now = int(time.time())
        to = config.market_address
        if request.action == "buy":
            if not request.deadline or not now < request.deadline <= now + 120:
                raise ValueError("The quote expired. Refresh it before signing.")
            if amount <= 0 or maximum <= 0:
                raise ValueError("A funded quote is required")
            signature, types, args = (
                "buy(bool,uint256,uint256,uint256)",
                ["bool", "uint256", "uint256", "uint256"],
                [request.is_call, amount, maximum, request.deadline],
            )
        elif request.action == "claim":
            if request.position_id is None:
                raise ValueError("Choose a position")
            owner = (
                await self.reader.read(
                    "positions(uint256)",
                    ["address", "bool", "bool", "uint256", "uint256", "uint256"],
                    ["uint256"],
                    [request.position_id],
                )
            )[0]
            if owner.lower() != wallet.lower():
                raise ValueError("Position does not belong to this wallet")
            signature, types, args = (
                "claim(uint256)",
                ["uint256"],
                [request.position_id],
            )
        else:
            if amount <= 0:
                raise ValueError("Enter a positive amount")
            if request.action == "approve":
                to = config.usdg_address
                signature, types, args = (
                    "approve(address,uint256)",
                    ["address", "uint256"],
                    [config.market_address, amount],
                )
            else:
                signature, types, args = (
                    f"{request.action}(uint256)",
                    ["uint256"],
                    [amount],
                )
        data = "0x" + (keccak(text=signature)[:4] + encode(types, args)).hex()
        await self.chain.rpc(
            "eth_call",
            [{"from": wallet, "to": to, "data": data, "value": "0x0"}, "latest"],
        )
        return ReviewedTransaction(
            chain_id=config.chain_id,
            wallet=wallet,
            action=request.action,
            to=to,
            data=data,
            expires_at=min(now + 90, request.deadline)
            if request.action == "buy"
            else now + 90,
        )

    async def status(self, tx_hash: str) -> dict:
        if not re.fullmatch(r"0x[0-9a-fA-F]{64}", tx_hash):
            raise ValueError("Invalid transaction hash")
        await self.chain.verify_chain()
        receipt = await self.chain.rpc("eth_getTransactionReceipt", [tx_hash])
        if not receipt:
            return {
                "hash": tx_hash,
                "confirmed": False,
                "failed": False,
                "confirmations": 0,
            }
        head = int(await self.chain.rpc("eth_blockNumber", []), 16)
        confirmations = max(0, head - int(receipt["blockNumber"], 16) + 1)
        failed = int(receipt["status"], 16) == 0
        confirmed = not failed and confirmations >= 2
        if confirmed and str(receipt.get("to", "")).lower() in {
            self.chain.settings.usdg_address.lower(),
            self.chain.settings.market_address.lower(),
        }:
            self.chain.invalidate_access(str(receipt.get("from", "")))
        return {
            "hash": tx_hash,
            "confirmed": confirmed,
            "failed": failed,
            "confirmations": confirmations,
        }
