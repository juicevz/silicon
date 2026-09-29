"""Review EVM calldata and track receipts. Signing stays in the user's wallet."""

import re
import time

from eth_abi import encode
from eth_utils import keccak, to_checksum_address

from .chain import ADDRESS, Chain
from .models import ReviewedTransaction, TransactionRequest
from .protocol import ProtocolReader


class Transactions:
    def __init__(self, chain: Chain, reader: ProtocolReader, rounds: dict[str, ProtocolReader] | None = None):
        self.chain, self.reader = chain, reader
        self.rounds = rounds or {}

    async def review(self, request: TransactionRequest) -> ReviewedTransaction:
        if not ADDRESS.fullmatch(request.wallet):
            raise ValueError("Invalid wallet address")
        config = self.chain.settings
        requested = request.series_address or config.market_address
        reader = self.reader if requested.lower() == config.market_address.lower() else self.rounds.get(requested.lower())
        if reader is None:
            raise ValueError("This round is not configured")
        if request.action == "buy" and reader is not self.reader:
            raise ValueError("Only the active market accepts new trades")
        if request.action in {"buy", "fund", "approve"} and not config.trading_enabled:
            raise ValueError("Funding and trading are not activated")
        await self.chain.verify_chain()
        await reader.poll()
        if not reader.address or not reader.snapshot.verified:
            raise ValueError("The Robinhood series could not be verified")
        if request.action == "fund" and not reader.snapshot.funding_enabled:
            raise ValueError("Deposits are not open for this round")
        amount, maximum = int(request.amount_raw), int(request.max_total_raw)
        if amount >= 2**256 or maximum >= 2**256:
            raise ValueError("Amount exceeds contract limits")
        wallet = to_checksum_address(request.wallet)
        now = int(time.time())
        to = reader.address
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
                await reader.read(
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
                    [reader.address, amount],
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
        if str(receipt.get("transactionHash", "")).lower() != tx_hash.lower():
            raise RuntimeError("The node returned a receipt for another transaction")
        head = int(await self.chain.rpc("eth_blockNumber", []), 16)
        confirmations = max(0, head - int(receipt["blockNumber"], 16) + 1)
        reverted = int(receipt["status"], 16) == 0
        failed = reverted and confirmations >= 2
        confirmed = not reverted and confirmations >= 2
        if confirmed and str(receipt.get("to", "")).lower() in {
            self.chain.settings.usdg_address.lower(),
            self.chain.settings.market_address.lower(),
            *self.rounds.keys(),
        }:
            self.chain.invalidate_access(str(receipt.get("from", "")))
        return {
            "hash": tx_hash,
            "confirmed": confirmed,
            "failed": failed,
            "confirmations": confirmations,
        }

    async def replacement(self, original_hash: str, replacement_hash: str) -> dict:
        if any(not re.fullmatch(r"0x[0-9a-fA-F]{64}", value) for value in (original_hash, replacement_hash)):
            raise ValueError("Invalid transaction hash")
        if original_hash.lower() == replacement_hash.lower():
            raise ValueError("Choose the replacement transaction, not the original hash.")
        await self.chain.verify_chain()
        original = await self.chain.rpc("eth_getTransactionByHash", [original_hash])
        replacement = await self.chain.rpc("eth_getTransactionByHash", [replacement_hash])
        if not original or not replacement:
            raise ValueError("The node cannot retrieve both transactions yet. Check their status in your wallet.")
        if (str(original.get("hash", "")).lower() != original_hash.lower()
                or str(replacement.get("hash", "")).lower() != replacement_hash.lower()
                or not ADDRESS.fullmatch(str(original.get("from", "")))
                or str(original.get("from", "")).lower() != str(replacement.get("from", "")).lower()
                or original.get("nonce") is None or replacement.get("nonce") is None
                or int(original["nonce"], 16) != int(replacement["nonce"], 16)):
            raise ValueError("The replacement must use the same wallet and nonce as the original transaction.")
        receipt = await self.chain.rpc("eth_getTransactionReceipt", [replacement_hash])
        if not receipt or str(receipt.get("transactionHash", "")).lower() != replacement_hash.lower():
            raise ValueError("The replacement has not been mined yet.")
        head = int(await self.chain.rpc("eth_blockNumber", []), 16)
        if head - int(receipt["blockNumber"], 16) + 1 < 2:
            raise ValueError("Wait for two confirmations of the replacement.")
        return {"hash": original_hash, "replacement_hash": replacement_hash,
                "wallet": original["from"], "confirmed": True, "reverted": int(receipt["status"], 16) == 0}
