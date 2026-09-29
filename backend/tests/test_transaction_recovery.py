from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.transactions import Transactions


ORIGINAL = "0x" + "a" * 64
REPLACEMENT = "0x" + "b" * 64
WALLET = "0x" + "1" * 40


def client(*, nonce="0x2", wallet=WALLET, confirmations=2, missing=False, reverted=False):
    async def rpc(method, params):
        if method == "eth_getTransactionByHash":
            if missing:
                return None
            return {"hash": params[0], "from": WALLET if params[0] == ORIGINAL else wallet,
                    "nonce": "0x2" if params[0] == ORIGINAL else nonce}
        if method == "eth_getTransactionReceipt":
            return {"transactionHash": params[0], "blockNumber": "0x64", "status": "0x0" if reverted else "0x1"}
        if method == "eth_blockNumber":
            return hex(100 + confirmations - 1)
        raise AssertionError(method)
    chain = SimpleNamespace(verify_chain=AsyncMock(), rpc=AsyncMock(side_effect=rpc),
                            settings=SimpleNamespace(usdg_address=WALLET, market_address=WALLET), invalidate_access=Mock())
    return Transactions(chain, None)


@pytest.mark.asyncio
@pytest.mark.parametrize("reverted", [False, True])
async def test_confirmed_same_nonce_replacement_resolves_both_speedup_and_cancel(reverted):
    transactions = client(reverted=reverted)
    result = await transactions.replacement(ORIGINAL, REPLACEMENT)
    assert result["hash"] == ORIGINAL and result["replacement_hash"] == REPLACEMENT
    assert result["wallet"] == WALLET and result["confirmed"] and result["reverted"] == reverted
    transactions.chain.verify_chain.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("options,reason", [
    ({"nonce": "0x3"}, "same wallet and nonce"),
    ({"wallet": "0x" + "2" * 40}, "same wallet and nonce"),
    ({"confirmations": 1}, "two confirmations"),
    ({"missing": True}, "retrieve both"),
])
async def test_unrelated_unconfirmed_or_missing_replacements_stay_unresolved(options, reason):
    with pytest.raises(ValueError, match=reason):
        await client(**options).replacement(ORIGINAL, REPLACEMENT)


@pytest.mark.asyncio
async def test_reverted_receipt_needs_two_confirmations_before_retry_is_possible():
    assert not (await client(confirmations=1, reverted=True).status(ORIGINAL))["failed"]
    assert (await client(confirmations=2, reverted=True).status(ORIGINAL))["failed"]


@pytest.mark.asyncio
async def test_status_rejects_wrong_receipt_hash():
    transactions = client()
    transactions.chain.rpc = AsyncMock(return_value={"transactionHash": REPLACEMENT})
    with pytest.raises(RuntimeError, match="another transaction"):
        await transactions.status(ORIGINAL)
