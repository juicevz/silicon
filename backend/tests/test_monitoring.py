import base64
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from pydantic import ValidationError

from app.alerts.models import AlertRequest, PushSubscription
from app.alerts.service import Alerts
from app.config import Settings
from app.market_data import MarketData
from app.models import ProviderQuote
from app.movers import daily_movers
from app.store import Store


def setup(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path)
    store = Store(tmp_path)
    data = MarketData(settings, store)
    alerts = Alerts(settings, store, data)
    return settings, store, data, alerts


def record(store, data, at, price, provider_price=None, provider_id="lambda"):
    market = data.markets["h100-sxm"]
    market.price = price
    market.stale = False
    market.status = "benchmark"
    market.source_updated_at = at.isoformat()
    market.coverage = market.required_providers = 5
    market.providers = [ProviderQuote(id=provider_id, provider="Lambda", price=provider_price or price,
        instance="H100 SXM", scope="instance", source_url="https://lambda.ai", updated_at=at.isoformat(), included=True)]
    store.record(market.id, at.isoformat(), str(price), "100", market.model_dump())
    return market


def test_movers_rank_real_changes_and_expose_both_receipts(tmp_path):
    _, store, data, _ = setup(tmp_path)
    at = datetime.now(UTC)
    record(store, data, at - timedelta(hours=24), 4)
    record(store, data, at, 5)
    result = daily_movers(store, data.snapshot()).markets[0]
    assert result.market == "h100-sxm" and result.status == "ready"
    assert result.change_pct == 25 and result.provider_moves[0].change_pct == 25
    assert store.receipt(result.receipt_hash)["price"] == "5"
    assert store.receipt(result.baseline_receipt_hash)["price"] == "4"
    assert result.baseline_time == (at - timedelta(hours=24)).isoformat()
    store.close()


@pytest.mark.parametrize("mode", ["sparse", "stale", "basket"])
def test_movers_withhold_unsupported_changes(tmp_path, mode):
    _, store, data, _ = setup(tmp_path)
    at = datetime.now(UTC)
    record(store, data, at - timedelta(hours=28 if mode == "sparse" else 24), 4)
    market = record(store, data, at, 5, provider_id="nebius" if mode == "basket" else "lambda")
    market.stale = mode == "stale"
    result = next(row for row in daily_movers(store, data.snapshot()).markets if row.market == market.id)
    assert result.change_pct is None
    assert result.status == {"sparse": "insufficient_history", "stale": "stale", "basket": "basket_changed"}[mode]
    store.close()


@pytest.mark.asyncio
async def test_price_alert_is_durable_private_and_one_shot(tmp_path):
    settings, store, data, alerts = setup(tmp_path)
    owner = alerts.owner("one")
    other = alerts.owner("two")
    rule = alerts.create(owner, AlertRequest(market="h100-sxm", price=5))
    record(store, data, datetime.now(UTC), 6)
    data.markets["h100-sxm"].stale = True
    await alerts.poll()
    assert not alerts.inbox(owner).events
    data.markets["h100-sxm"].stale = False
    await alerts.poll()
    await alerts.poll()
    assert len(alerts.inbox(owner).events) == 1
    assert alerts.inbox(owner).events[0].receipt_hash
    alerts.remove(other, rule.id)
    assert not alerts.inbox(other).rules and len(alerts.inbox(owner).rules) == 1
    store.close()
    reopened = Store(tmp_path)
    restored = Alerts(settings, reopened, MarketData(settings, reopened))
    assert len(restored.inbox(owner).events) == 1 and restored.inbox(owner).rules[0].triggered_at
    reopened.close()


@pytest.mark.asyncio
async def test_provider_changes_ignore_coverage_and_instance_substitution(tmp_path):
    _, store, data, alerts = setup(tmp_path)
    owner = alerts.owner("one")
    at = datetime.now(UTC)
    record(store, data, at, 4)
    alerts.create(owner, AlertRequest(market="h100-sxm", kind="provider"))
    data.markets["h100-sxm"].providers = []
    await alerts.poll()
    record(store, data, at + timedelta(seconds=1), 5, provider_id="nebius")
    await alerts.poll()
    assert not alerts.inbox(owner).events
    record(store, data, at + timedelta(seconds=2), 6)
    # Same listing returned at a changed price. It can alert even if the median is withheld.
    data.markets["h100-sxm"].stale = True
    await alerts.poll()
    assert len(alerts.inbox(owner).events) == 1
    assert "lambda" in alerts.inbox(owner).events[0].message
    store.close()


@pytest.mark.asyncio
async def test_recovery_needs_an_observed_stale_to_fresh_transition(tmp_path):
    _, store, data, alerts = setup(tmp_path)
    owner = alerts.owner("one")
    at = datetime.now(UTC)
    record(store, data, at, 4)
    alerts.create(owner, AlertRequest(market="h100-sxm", kind="recovery"))
    await alerts.poll()
    assert not alerts.inbox(owner).events
    data.markets["h100-sxm"].stale = True
    await alerts.poll()
    data.markets["h100-sxm"].stale = False
    await alerts.poll()
    assert len(alerts.inbox(owner).events) == 1
    store.close()


def subscription(endpoint="https://fcm.googleapis.com/fcm/send/example"):
    def encode(value):
        return base64.urlsafe_b64encode(value).decode().rstrip("=")
    return {"endpoint": endpoint, "keys": {"p256dh": encode(b"\x04" + b"x" * 64), "auth": encode(b"x" * 16)}}


@pytest.mark.parametrize("endpoint", ["http://fcm.googleapis.com/a", "https://127.0.0.1/a", "https://fcm.googleapis.com.evil.test/a", "https://fcm.googleapis.com:8443/a", "https://user@fcm.googleapis.com/a"])
def test_push_rejects_arbitrary_outbound_endpoints(endpoint):
    with pytest.raises(ValidationError):
        PushSubscription.model_validate(subscription(endpoint))


@pytest.mark.asyncio
async def test_push_failure_retains_inbox_and_stops_after_three_attempts(tmp_path, monkeypatch):
    settings, store, data, alerts = setup(tmp_path)
    key = tmp_path / "vapid.pem"
    key.write_text("mock-key")
    settings.alerts_vapid_private_key_path = key
    settings.alerts_vapid_public_key = "mock-public"
    owner = alerts.owner("one")
    alerts.subscribe(owner, PushSubscription.model_validate(subscription()))
    alerts.create(owner, AlertRequest(market="h100-sxm", price=5))
    record(store, data, datetime.now(UTC), 6)
    calls = []
    def failure(*args):
        calls.append(1)
        raise RuntimeError("push offline")
    monkeypatch.setattr(alerts, "send", failure)
    for _ in range(5):
        await alerts.poll()
    inbox = alerts.inbox(owner)
    assert len(calls) == 3 and len(inbox.events) == 1
    assert inbox.events[0].delivery == "failed"
    store.close()


def test_alert_expiry_cleanup_and_limits(tmp_path):
    _, store, _, alerts = setup(tmp_path)
    owner = alerts.owner("one")
    for _ in range(20):
        alerts.create(owner, AlertRequest(market="h100-sxm", price=5))
    with pytest.raises(ValueError, match="limit"):
        alerts.create(owner, AlertRequest(market="h100-sxm", price=5))
    alerts.db.execute("UPDATE alert_sessions SET seen=?", ((datetime.now(UTC) - timedelta(days=91)).isoformat(),))
    alerts.cleanup()
    assert not alerts.inbox(owner).rules
    assert alerts.db.execute("SELECT COUNT(*) FROM alert_sessions").fetchone()[0] == 0
    store.close()


@pytest.mark.asyncio
async def test_alert_routes_require_session_and_isolate_owners(api_module):
    module = api_module
    transport = httpx.ASGITransport(app=module.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as one, httpx.AsyncClient(transport=transport, base_url="http://test") as two:
        assert (await one.post("/api/v1/alerts", json={"market": "h100-sxm", "price": 5})).status_code == 401
        response = await one.get("/api/v1/alerts")
        assert response.status_code == 200 and "HttpOnly" in response.headers["set-cookie"]
        assert (await one.post("/api/v1/alerts", headers={"Origin": "https://evil.test"}, json={"market": "h100-sxm", "price": 5})).status_code == 403
        created = await one.post("/api/v1/alerts", json={"market": "h100-sxm", "price": 5})
        assert created.status_code == 201
        await two.get("/api/v1/alerts")
        await two.delete(f"/api/v1/alerts/{created.json()['id']}")
        assert not (await two.get("/api/v1/alerts")).json()["rules"]
        assert len((await one.get("/api/v1/alerts")).json()["rules"]) == 1
        assert (await one.post("/api/v1/alerts", json={"market": "b200", "kind": "recovery"})).status_code == 422
        assert (await one.get("/api/v1/movers")).status_code == 200


@pytest.mark.asyncio
async def test_successful_push_and_revoked_subscription_keep_durable_events(tmp_path, monkeypatch):
    from pywebpush import WebPushException
    import requests

    settings, store, data, alerts = setup(tmp_path)
    key = tmp_path / "vapid.pem"
    key.write_text("mock-key")
    settings.alerts_vapid_private_key_path = key
    settings.alerts_vapid_public_key = "mock-public"
    owner = alerts.owner("one")
    alerts.subscribe(owner, PushSubscription.model_validate(subscription()))
    alerts.create(owner, AlertRequest(market="h100-sxm", price=5))
    record(store, data, datetime.now(UTC), 6)
    calls = []
    monkeypatch.setattr(alerts, "send", lambda sub, payload: calls.append(payload))
    await alerts.poll()
    assert len(calls) == 1 and alerts.inbox(owner).events[0].delivery == "sent"
    alerts.create(owner, AlertRequest(market="h100-sxm", price=5))
    response = requests.Response()
    response.status_code = 410
    def revoked(*args):
        raise WebPushException("expired", response=response)
    monkeypatch.setattr(alerts, "send", revoked)
    await alerts.poll()
    assert not alerts.inbox(owner).push_enabled
    assert len(alerts.inbox(owner).events) == 2
    assert any(event.delivery == "failed" for event in alerts.inbox(owner).events)
    store.close()


@pytest.mark.asyncio
async def test_expired_rules_and_future_sources_do_not_trigger(tmp_path):
    _, store, data, alerts = setup(tmp_path)
    owner = alerts.owner("one")
    rule = alerts.create(owner, AlertRequest(market="h100-sxm", price=5))
    record(store, data, datetime.now(UTC) + timedelta(hours=1), 6)
    await alerts.poll()
    assert not alerts.inbox(owner).events
    data.markets["h100-sxm"].source_updated_at = datetime.now(UTC).isoformat()
    with alerts.db:
        alerts.db.execute("UPDATE alert_rules SET expires=? WHERE id=?", ((datetime.now(UTC) - timedelta(seconds=1)).isoformat(), rule.id))
    await alerts.poll()
    assert not alerts.inbox(owner).events
    store.close()
