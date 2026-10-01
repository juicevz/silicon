from datetime import UTC, datetime, timedelta

import httpx
import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import HTTPException
from pydantic import ValidationError

from app.holders.models import AdvancedAlertRequest, WorkspaceRequest
from app.holders.service import Holders
from app.models import Access
from test_monitoring import record, setup, subscription
from app.alerts.models import PushSubscription

OWNER = "0x" + "1" * 40


class FakeChain:
    eligible = True
    verified = True

    def invalidate_access(self, owner):
        pass

    async def access(self, owner):
        return Access(address=owner, checked_at=datetime.now(UTC).isoformat(), verified=self.verified,
                      benefits_verified=self.verified, workflow_benefits=self.eligible)


def holder_setup(tmp_path):
    settings, store, data, alerts = setup(tmp_path)
    chain = FakeChain()
    return settings, store, data, Holders(chain, alerts), chain


def workspace(**updates):
    return WorkspaceRequest.model_validate({"name": "Compute research", "state": {
        "market": "b200", "range": "6h", "filter": "", "watchlist": ["b200", "h100-sxm"],
        "notes": "Private thesis", "templates": [{"id": "my-template", "name": "Fall", "spread": False,
            "side": "put", "days": 7, "units": 1, "premium": "2.1", "thesis": "Rental cost thesis"}],
    }, **updates})


def price_rule(**updates):
    return AdvancedAlertRequest.model_validate({"name": "H100 lower", "conditions": [
        {"market": "h100-sxm", "kind": "price", "direction": "below", "threshold": 5}],
        "recurring": True, "cooldown_minutes": 5, **updates})


def test_workspaces_persist_isolate_and_detect_stale_saves(tmp_path):
    settings, store, data, service, chain = holder_setup(tmp_path)
    first = service.save(OWNER, workspace())
    assert first.revision == 1
    assert not service.workspaces("another")
    with pytest.raises(HTTPException) as cross:
        service.save("another", workspace(revision=1), first.id)
    assert cross.value.status_code == 404
    second = service.save(OWNER, workspace(name="Updated", revision=1), first.id)
    assert second.revision == 2
    with pytest.raises(HTTPException, match="another device"):
        service.save(OWNER, workspace(revision=1), first.id)
    with pytest.raises(HTTPException):
        service.remove_workspace(OWNER, first.id, 1)
    store.close()
    _, reopened, _, restored, _ = holder_setup(tmp_path)
    assert restored.workspaces(OWNER)[0].name == "Updated"
    assert restored.workspaces(OWNER)[0].state.notes == "Private thesis"
    restored.remove_workspace(OWNER, first.id, 2)
    assert not restored.workspaces(OWNER)
    reopened.close()


def test_workspace_and_alert_storage_limits(tmp_path):
    _, store, _, service, _ = holder_setup(tmp_path)
    for _ in range(5):
        service.save(OWNER, workspace())
    with pytest.raises(HTTPException, match="full"):
        service.save(OWNER, workspace())
    for _ in range(100):
        service.create_alert(OWNER, price_rule())
    with pytest.raises(HTTPException, match="full"):
        service.create_alert(OWNER, price_rule())
    store.close()


@pytest.mark.parametrize("state", [
    {"market": "fake-gpu"}, {"notes": "x" * 10001}, {"range": "forever"},
    {"watchlist": ["b200", "b200"]}, {"templates": [dict(id="a", name="a", spread=False, side="put", days=7, units=float("inf"), premium="2", thesis="")]},
])
def test_workspace_validation(state):
    with pytest.raises(ValidationError):
        WorkspaceRequest(name="Workspace", state=state)


@pytest.mark.asyncio
async def test_recurring_rearms_only_after_valid_nonmatch_and_respects_cooldown(tmp_path):
    _, store, data, service, _ = holder_setup(tmp_path)
    at = datetime.now(UTC)
    record(store, data, at, 4)
    rule = service.create_alert(OWNER, price_rule())
    await service.poll()
    assert len(service.inbox(OWNER, True).events) == 1
    await service.poll()
    assert len(service.inbox(OWNER, True).events) == 1
    # A stale observation does not rearm a price rule.
    data.markets["h100-sxm"].stale = True
    await service.poll()
    data.markets["h100-sxm"].stale = False
    await service.poll()
    assert service.inbox(OWNER, True).rules[0].status == "waiting_reset"
    record(store, data, at + timedelta(seconds=1), 6)
    await service.poll()
    record(store, data, at + timedelta(seconds=2), 4)
    await service.poll()
    assert service.inbox(OWNER, True).rules[0].status == "cooldown"
    with store.db:
        store.db.execute("UPDATE holder_rules SET triggered=? WHERE id=?", ((at - timedelta(minutes=6)).isoformat(), rule.id))
    await service.poll()
    assert len(service.inbox(OWNER, True).events) == 2
    store.close()


@pytest.mark.asyncio
async def test_combined_change_and_coverage_require_matched_history(tmp_path):
    _, store, data, service, _ = holder_setup(tmp_path)
    at = datetime.now(UTC)
    record(store, data, at - timedelta(hours=24), 5)
    market = record(store, data, at, 4)
    market.coverage = 4
    service.create_alert(OWNER, price_rule(conditions=[
        {"market": "h100-sxm", "kind": "change", "direction": "below", "threshold": -3},
        {"market": "h100-sxm", "kind": "benchmark"}]))
    await service.poll()
    assert not service.inbox(OWNER, True).events
    market.coverage = 5
    await service.poll()
    events = service.inbox(OWNER, True).events
    assert len(events) == 1 and "-20.00%" in events[0].message and events[0].receipt_hash
    store.close()


@pytest.mark.parametrize("mode", ["missing", "basket", "stale", "future"])
@pytest.mark.asyncio
async def test_relative_alert_waits_on_unreliable_data(tmp_path, mode):
    _, store, data, service, _ = holder_setup(tmp_path)
    at = datetime.now(UTC)
    if mode != "missing":
        record(store, data, at - timedelta(hours=24), 5)
    market = record(store, data, at + timedelta(hours=1 if mode == "future" else 0), 4, provider_id="nebius" if mode == "basket" else "lambda")
    market.stale = mode == "stale"
    service.create_alert(OWNER, price_rule(conditions=[{"market": "h100-sxm", "kind": "change", "direction": "below", "threshold": -3}]))
    await service.poll()
    assert not service.inbox(OWNER, True).events
    assert service.inbox(OWNER, True).rules[0].status == "waiting_data"
    store.close()


@pytest.mark.asyncio
async def test_holder_loss_and_rpc_failure_pause_monitoring_keep_data(tmp_path):
    _, store, data, service, chain = holder_setup(tmp_path)
    service.save(OWNER, workspace())
    service.create_alert(OWNER, price_rule())
    record(store, data, datetime.now(UTC), 4)
    chain.eligible = False
    await service.poll()
    assert not service.inbox(OWNER, False).events
    assert service.inbox(OWNER, False).rules[0].status == "paused"
    assert service.workspaces(OWNER)
    with pytest.raises(HTTPException) as result:
        await service.require_holder(OWNER)
    assert result.value.status_code == 403
    chain.eligible, chain.verified = True, False
    service._eligibility.clear()
    await service.poll()
    assert not service.inbox(OWNER, False).events
    with pytest.raises(HTTPException) as result:
        await service.require_holder(OWNER)
    assert result.value.status_code == 503
    chain.verified = True
    service._eligibility.clear()
    await service.poll()
    assert len(service.inbox(OWNER, True).events) == 1
    store.close()


@pytest.mark.asyncio
async def test_rpc_exception_does_not_hide_saved_research(tmp_path, monkeypatch):
    _, store, _, service, chain = holder_setup(tmp_path)
    service.save(OWNER, workspace())
    async def unavailable(_owner):
        raise OSError("RPC unavailable")
    monkeypatch.setattr(chain, "access", unavailable)
    account = await service.account(OWNER)
    assert not account.eligible and not account.verified
    assert service.workspaces(OWNER)[0].state.notes == "Private thesis"
    with pytest.raises(HTTPException) as result:
        await service.require_holder(OWNER)
    assert result.value.status_code == 503
    store.close()


@pytest.mark.asyncio
async def test_once_push_retries_after_completion_and_remains_private(tmp_path, monkeypatch):
    settings, store, data, service, _ = holder_setup(tmp_path)
    key = tmp_path / "vapid.pem"
    key.write_text("test")
    settings.alerts_vapid_private_key_path, settings.alerts_vapid_public_key = key, "test-public"
    service.alerts.subscribe(service.alert_owner(OWNER), PushSubscription.model_validate(subscription()))
    rule = service.create_alert(OWNER, price_rule(recurring=False))
    record(store, data, datetime.now(UTC), 4)
    calls = []
    def fail(*args):
        calls.append(1)
        raise RuntimeError("offline")
    monkeypatch.setattr(service.alerts, "send", fail)
    for _ in range(4):
        await service.poll()
        await service.alerts.deliver()  # Basic loop must not bypass holder eligibility.
    assert len(calls) == 3
    inbox = service.inbox(OWNER, True)
    assert len(inbox.events) == 1 and inbox.events[0].delivery == "failed"
    assert inbox.rules[0].status == "complete"
    assert not service.inbox("another", True).events
    service.remove_alert("another", rule.id)
    assert len(service.inbox(OWNER, True).rules) == 1
    store.close()


async def sign_in(client, account):
    response = await client.post("/api/v1/holders/auth/challenge", json={"address": account.address})
    assert response.status_code == 200
    challenge = response.json()
    signature = "0x" + account.sign_message(encode_defunct(text=challenge["message"])).signature.hex()
    response = await client.post("/api/v1/holders/auth/verify", json={"challenge_id": challenge["id"], "signature": signature})
    assert response.status_code == 200, response.text
    return challenge, signature


@pytest.mark.asyncio
async def test_signed_api_cross_device_ownership_and_write_gates(api_module, monkeypatch):
    module = api_module
    module.config.compute_origin = "https://test"
    chain = FakeChain()
    monkeypatch.setattr(module.chain, "access", chain.access)
    account, other = Account.create(), Account.create()
    transport = httpx.ASGITransport(app=module.app)
    headers = {"Origin": "https://test", "X-Silicon-Wallet": account.address}
    async with httpx.AsyncClient(transport=transport, base_url="https://test", headers=headers) as one, httpx.AsyncClient(transport=transport, base_url="https://test", headers=headers) as two:
        assert (await one.get("/api/v1/holders/workspaces")).status_code == 401
        challenge, signature = await sign_in(one, account)
        assert "silicon_holder" in one.cookies
        replay = await one.post("/api/v1/holders/auth/verify", json={"challenge_id": challenge["id"], "signature": signature})
        assert replay.status_code == 401
        created = await one.post("/api/v1/holders/workspaces", json=workspace().model_dump())
        assert created.status_code == 201, created.text
        identifier = created.json()["id"]
        assert (await one.get("/api/v1/holders/workspaces", headers={"X-Silicon-Wallet": other.address})).status_code == 401
        await sign_in(two, account)
        assert (await two.get("/api/v1/holders/workspaces")).json()[0]["id"] == identifier
        changed = await two.put(f"/api/v1/holders/workspaces/{identifier}", json=workspace(revision=1, name="Device two").model_dump())
        assert changed.status_code == 200
        conflict = await one.put(f"/api/v1/holders/workspaces/{identifier}", json=workspace(revision=1).model_dump())
        assert conflict.status_code == 409
        chain.eligible = False
        assert (await one.get("/api/v1/holders/workspaces")).status_code == 200
        assert (await one.post("/api/v1/holders/workspaces", json=workspace().model_dump())).status_code == 403
        assert (await one.post("/api/v1/holders/alerts", json=price_rule().model_dump())).status_code == 403
        assert (await one.delete(f"/api/v1/holders/workspaces/{identifier}?revision=2")).status_code == 200
        assert (await one.post("/api/v1/holders/auth/logout")).status_code == 200
        assert (await one.get("/api/v1/holders/workspaces")).status_code == 401


@pytest.mark.asyncio
async def test_auth_binding_origin_expiry_and_invalid_payload(api_module, monkeypatch):
    module = api_module
    module.config.compute_origin = "https://test"
    monkeypatch.setattr(module.chain, "access", FakeChain().access)
    account = Account.create()
    transport = httpx.ASGITransport(app=module.app)
    async with httpx.AsyncClient(transport=transport, base_url="https://test", headers={"Origin": "https://test", "X-Silicon-Wallet": account.address}) as client:
        assert (await client.post("/api/v1/holders/auth/challenge", headers={"Origin": "https://evil.test"}, json={"address": account.address})).status_code == 403
        response = await client.post("/api/v1/holders/auth/challenge", json={"address": account.address})
        assert "HttpOnly" in response.headers["set-cookie"] and "Secure" in response.headers["set-cookie"]
        body = response.json()
        signature = "0x" + account.sign_message(encode_defunct(text=body["message"])).signature.hex()
        client.cookies.clear()
        assert (await client.post("/api/v1/holders/auth/verify", json={"challenge_id": body["id"], "signature": signature})).status_code == 401
        await sign_in(client, account)
        bad = await client.post("/api/v1/holders/workspaces", json={"name": "private-notes-must-not-echo", "state": {"unexpected": "private"}})
        assert bad.status_code == 422 and "private" not in bad.text
        large = await client.post("/api/v1/holders/workspaces", content=b"x" * 96001)
        assert large.status_code == 413
        with module.store.db:
            module.store.db.execute("UPDATE holder_sessions SET expires=0")
        assert (await client.get("/api/v1/holders/workspaces")).status_code == 401
