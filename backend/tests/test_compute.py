import asyncio
import json
import secrets
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from time import time

import httpx
import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.compute.ledger import ComputeLedger, atoms, digest
from app.compute.provider import MODELS
from app.compute.service import validated_draft
from app.config import Settings

MODEL = next(iter(MODELS))
ORIGIN = "http://testserver"


@pytest.fixture
def compute(api_module):
    service = api_module.compute
    settings = service.settings
    settings.compute_enabled = True
    settings.compute_origin = ORIGIN
    settings.openrouter_api_key = SecretStr("mock-provider-secret")
    settings.compute_spend_limit_usd = Decimal("1")
    settings.compute_grant_usd = Decimal("0.1")
    settings.compute_grant_pool_usd = Decimal("1")
    settings.compute_open_enrollment = True
    calls = []
    response = {"status": 200, "body": {"id": "gen-test", "object": "chat.completion", "choices": [{"index": 0, "message": {"role": "assistant", "content": "A recorded reference is not a tradable quote."}, "finish_reason": "stop"}], "usage": {"cost": .0000123, "prompt_tokens": 30, "completion_tokens": 10}}}

    def upstream(request):
        assert request.headers["authorization"] == "Bearer mock-provider-secret"
        if request.url.path.endswith("/models/user"):
            return httpx.Response(200, json={"data": [{"id": key, "pricing": {"prompt": "0.00000001", "completion": "0.0000001"}, "supported_parameters": ["tools"], "context_length": 100000} for key in MODELS]})
        if request.url.path.endswith("/generation"):
            return httpx.Response(200, json={"data": {"total_cost": .000014, "native_tokens_prompt": 35, "native_tokens_completion": 12}})
        calls.append(json.loads(request.content))
        if response.get("exception"):
            raise httpx.ReadTimeout("secret upstream diagnostic")
        if "stream" in response:
            return httpx.Response(response["status"], content=response["stream"], headers={"content-type": "text/event-stream"})
        return httpx.Response(response["status"], json=response["body"])

    service.provider.client = httpx.AsyncClient(transport=httpx.MockTransport(upstream))
    client = TestClient(api_module.app, headers={"Origin": ORIGIN})
    yield client, service, calls, response
    client.close()
    asyncio.run(service.provider.close())


def login(client, wallet=None):
    wallet = wallet or Account.create()
    challenge = client.post("/api/v1/compute/auth/challenge", json={"address": wallet.address})
    assert challenge.status_code == 200
    challenge = challenge.json()
    signature = "0x" + Account.sign_message(encode_defunct(text=challenge["message"]), wallet.key).signature.hex()
    body = {"challenge_id": challenge["id"], "signature": signature}
    result = client.post("/api/v1/compute/auth/verify", json=body)
    assert result.status_code == 200
    return wallet, body, result


def chat(client, **changes):
    body = {"mode": "chat", "model": MODEL, "messages": [{"role": "user", "content": "private prompt fixture"}], "request_id": secrets.token_hex(16)}
    body.update(changes)
    return client.post("/api/v1/compute/chat", json=body)


def test_auth_origin_expiry_signature_replay_and_single_allocation(compute):
    client, service, _, _ = compute
    wallet, body, result = login(client)
    assert "HttpOnly" in result.headers["set-cookie"] and "SameSite=strict" in result.headers["set-cookie"]
    assert client.post("/api/v1/compute/auth/verify", json=body).status_code == 401
    assert client.post("/api/v1/compute/auth/challenge", json={"address": wallet.address}, headers={"origin": "https://elsewhere.test"}).status_code == 403
    _, _, second = login(client, wallet)
    assert second.json()["available_usd"] == result.json()["available_usd"]
    challenge = client.post("/api/v1/compute/auth/challenge", json={"address": wallet.address}).json()
    assert client.post("/api/v1/compute/auth/verify", json={"challenge_id": challenge["id"], "signature": "0x" + "00" * 65}).status_code == 401
    signature = "0x" + Account.sign_message(encode_defunct(text=challenge["message"]), Account.create().key).signature.hex()
    assert client.post("/api/v1/compute/auth/verify", json={"challenge_id": challenge["id"], "signature": signature}).status_code == 401
    service.ledger.db.execute("UPDATE compute_challenges SET expires_at=0")
    assert client.post("/api/v1/compute/auth/verify", json={"challenge_id": challenge["id"], "signature": signature}).status_code == 401
    assert client.post("/api/v1/compute/auth/logout").status_code == 204
    assert client.get("/api/v1/compute/account").status_code == 401


def test_private_keys_are_hashed_owner_scoped_and_revocable(compute):
    client, service, _, _ = compute
    wallet, _, _ = login(client)
    result = client.post("/api/v1/compute/keys", json={"name": "My CLI"})
    assert result.status_code == 201
    key = result.json()
    headers = {"Authorization": "Bearer " + key["key"]}
    assert client.get("/api/v1/models", headers=headers).status_code == 200
    assert key["key"] not in json.dumps([dict(row) for row in service.ledger.db.execute("SELECT * FROM compute_keys")])
    assert "mock-provider-secret" not in client.get("/api/v1/compute/models").text
    assert service.ledger.db.execute("SELECT hash FROM compute_keys").fetchone()[0] == digest(key["key"])
    login(client)
    assert client.get("/api/v1/compute/keys").json() == []
    assert client.delete("/api/v1/compute/keys/" + key["info"]["id"]).status_code == 404
    login(client, wallet)
    assert client.delete("/api/v1/compute/keys/" + key["info"]["id"]).status_code == 204
    assert client.get("/api/v1/models", headers=headers).status_code == 401


def test_billing_settles_once_and_prompts_never_enter_usage_or_database(compute):
    client, service, calls, _ = compute
    wallet, _, _ = login(client)
    request_id = secrets.token_hex(16)
    reply = chat(client, request_id=request_id)
    assert reply.status_code == 200
    assert reply.json()["accounting"] == "settled"
    assert chat(client, request_id=request_id).status_code == 409 and len(calls) == 1
    provider = calls[0]["provider"]
    assert provider["require_parameters"] and provider["data_collection"] == "deny"
    assert provider["max_price"]["request"] == 0
    assert service.ledger.account(wallet.address.lower()).used_usd == "0.000012300"
    service.ledger.settle(reply.json()["id"], atoms(1))
    assert service.ledger.account(wallet.address.lower()).used_usd == "0.000012300"
    usage = client.get("/api/v1/compute/usage")
    assert "private prompt fixture" not in usage.text
    dump = "\n".join(service.ledger.db.iterdump())
    assert "private prompt fixture" not in dump and "A recorded reference is not a tradable quote." not in dump
    assert "mock-provider-secret" not in dump


@pytest.mark.parametrize("status,expected", [(402, "failed"), (429, "failed"), (500, "pending"), (504, "pending")])
def test_rejected_and_uncertain_billing_are_distinguished(compute, status, expected):
    client, service, _, response = compute
    login(client)
    response.update(status=status, body={"error": {"message": "secret provider debug", "code": status}})
    result = chat(client)
    assert result.status_code == 503 and "secret provider debug" not in result.text
    row = service.ledger.db.execute("SELECT * FROM compute_requests").fetchone()
    assert row["status"] == expected
    assert (row["cost"] == 0) if expected == "failed" else (row["cost"] is None)


def test_disconnect_holds_usage_and_known_generations_reconcile(compute):
    client, service, _, response = compute
    wallet, _, _ = login(client)
    response["exception"] = True
    assert chat(client).status_code == 502
    row = service.ledger.db.execute("SELECT * FROM compute_requests").fetchone()
    assert row["status"] == "pending" and row["cost"] is None
    assert Decimal(service.ledger.account(wallet.address.lower()).pending_usd) > 0
    service.ledger.generation(row["id"], "known-generation")
    service.ledger.db.execute("UPDATE compute_requests SET updated_at=?", (int(time()) - 180,))
    asyncio.run(service.reconcile())
    assert service.ledger.account(wallet.address.lower()).pending_usd == "0.000000000"
    assert service.ledger.account(wallet.address.lower()).used_usd == "0.000014000"


def test_streaming_function_messages_and_billing(compute):
    client, service, _, response = compute
    login(client)
    key = client.post("/api/v1/compute/keys", json={"name": "CLI"}).json()["key"]
    response["stream"] = '\n'.join(["data: " + json.dumps({"id": "gen-stream", "choices": [{"delta": {"content": "Hello"}}]}), "", "data: " + json.dumps({"id": "gen-stream", "choices": [], "usage": {"cost": .0001, "prompt_tokens": 10, "completion_tokens": 2}}), "", "data: [DONE]", ""])
    result = client.post("/api/v1/chat/completions", headers={"Authorization": "Bearer " + key}, json={"model": MODEL, "messages": [{"role": "user", "content": "hello"}], "stream": True, "tools": [{"type": "function", "function": {"name": "get_price", "parameters": {"type": "object", "properties": {}}}}]})
    assert result.status_code == 200 and "Hello" in result.text and "[DONE]" in result.text
    assert service.ledger.db.execute("SELECT status FROM compute_requests").fetchone()[0] == "completed"
    assert "mock-provider-secret" not in result.text


def test_market_context_and_validated_strategy_remain_paper(compute):
    client, _, calls, response = compute
    login(client)
    result = chat(client, mode="market")
    assert result.status_code == 200
    assert any(source["url"].endswith("/context") for source in result.json()["sources"])
    assert "source_time" in calls[0]["messages"][0]["content"] and "execution" in calls[0]["messages"][0]["content"]
    draft = {"kind": "trend", "side": "put", "days": 14, "units": 1, "premium_per_unit": 2, "scenario_move_pct": -5, "h100_move_pct": 0, "thesis": "A paper test of softer H100 rental prices.", "assumptions": ["The premium is an assumption, not a live quote."]}
    response["body"]["choices"][0]["message"]["content"] = json.dumps(draft)
    result = chat(client, mode="strategy")
    assert result.status_code == 200 and result.json()["draft"]["days"] == 14
    assert calls[-1]["reasoning"] == {"enabled": False}
    assert '"id":"b200"' in calls[-1]["messages"][0]["content"]
    assert client.get("/api/v1/strategies/paper").json()["records"] == []
    draft["days"] = 365
    response["body"]["choices"][0]["message"]["content"] = json.dumps(draft)
    assert chat(client, mode="strategy").status_code == 502


def test_request_validation_and_budget_gate_block_upstream(compute):
    client, service, calls, _ = compute
    wallet, _, _ = login(client)
    assert chat(client, model="unknown/unbounded").status_code == 400
    result = client.post("/api/v1/compute/chat", json={"private_prompt": "do-not-echo-me"})
    assert result.status_code == 422 and "do-not-echo-me" not in result.text
    assert client.post("/api/v1/compute/chat", content=b"x" * 96001).status_code == 413
    service.ledger.db.execute("UPDATE compute_accounts SET granted=0 WHERE address=?", (wallet.address.lower(),))
    assert chat(client).status_code == 402 and calls == []


def test_drafts_accept_complete_json_blocks_and_replace_model_payout_claims():
    payload = {"kind": "trend", "side": "put", "days": 14, "units": 1, "premium_per_unit": 2, "scenario_move_pct": -5, "h100_move_pct": -5, "thesis": "A 5 USDG payout gives a net gain of 3 USDG.", "assumptions": ["No trading fees applied.", "Rental prices fall by 5%."]}
    draft = validated_draft("```json\n" + json.dumps(payload) + "\n```\nExtra provider prose.")
    assert "net gain" not in draft.thesis
    assert "No trading fees" not in " ".join(draft.assumptions)
    assert "1% platform fee" in " ".join(draft.assumptions)
    assert draft.h100_move_pct == 0


def test_simultaneous_reservations_cannot_overspend_or_reset_on_restart(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path, compute_enabled=True, compute_spend_limit_usd="0.1")
    ledger = ComputeLedger(tmp_path, settings)
    address = "0x" + "1" * 40
    ledger.db.execute("INSERT INTO compute_accounts(address,granted,created_at) VALUES (?,?,?)", (address, atoms("0.1"), int(time())))
    def reserve(_):
        connection = ComputeLedger(tmp_path, settings)
        try:
            return connection.reserve(address, secrets.token_hex(16), "fingerprint", MODEL, "api", atoms("0.075"))
        except HTTPException as error:
            return error.status_code
        finally:
            connection.close()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(reserve, range(2)))
    assert sum(isinstance(value, str) for value in results) == 1 and 402 in results
    ledger.close()
    reopened = ComputeLedger(tmp_path, settings)
    assert reopened.account(address).pending_usd == "0.075000000"
    reopened.close()


def test_global_budget_and_admission_caps_are_atomic(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path, compute_enabled=True, compute_open_enrollment=True, compute_grant_usd="0.1", compute_grant_pool_usd="0.1", compute_spend_limit_usd="0.1", compute_max_accounts=2)
    ledger = ComputeLedger(tmp_path, settings)
    addresses = ["0x" + str(i) * 40 for i in (1, 2, 3)]
    for i, address in enumerate(addresses):
        nonce = secrets.token_hex(16)
        ledger.challenge(address, "Sign in", nonce, str(i))
        if i == 2:
            with pytest.raises(HTTPException) as error:
                ledger.sign_in(nonce, address)
            assert error.value.status_code == 403
        else:
            ledger.sign_in(nonce, address)
    assert ledger.account(addresses[1]).available_usd == "0.000000000"
    ledger.db.execute("UPDATE compute_accounts SET granted=?", (atoms(1),))
    ledger.reserve(addresses[0], secrets.token_hex(16), "a", MODEL, "chat", atoms("0.075"))
    with pytest.raises(HTTPException) as error:
        ledger.reserve(addresses[1], secrets.token_hex(16), "b", MODEL, "chat", atoms("0.075"))
    assert error.value.status_code == 503
    ledger.close()
