from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.store import Store
from app.strategies import PaperRequest, Strategies


@pytest.fixture
def book(tmp_path):
    store = Store(tmp_path)
    yield Strategies(store)
    store.close()


def record(book, market, at, price):
    book.store.record(market, at.isoformat(), price, "100", {"providers": []})


def test_paper_immutable_entry_and_exact_capped_settlement(book):
    at = datetime(2026, 9, 25, tzinfo=UTC)
    record(book, "h100-sxm", at, "4")
    position = book.create("browser-a", PaperRequest(side="put", days=7), at)
    assert position.cost == "2.020000"
    record(book, "h100-sxm", at + timedelta(days=7, minutes=5), "3.6")
    outcome = book.book("browser-a", at + timedelta(days=7, hours=1)).records[0]
    assert outcome.status == "settled"
    assert outcome.payout == "10.000000" and outcome.profit == "7.980000"
    assert outcome.entry_receipts == position.entry_receipts
    assert not book.book("browser-b", at).records
    assert book.book("browser-a", at + timedelta(days=10)).records[0] == outcome


def test_spread_normalizes_both_legs_and_rejects_misaligned_entry(book):
    at = datetime(2026, 9, 25, tzinfo=UTC)
    record(book, "h100-sxm", at - timedelta(minutes=16), "4")
    record(book, "b200", at, "8")
    with pytest.raises(ValueError, match="15 minutes"):
        book.create("a", PaperRequest(kind="generation_spread"), at)
    record(book, "h100-sxm", at, "4")
    book.create("a", PaperRequest(kind="generation_spread", side="call", days=7), at)
    record(book, "h100-sxm", at + timedelta(days=7), "4.2")
    record(book, "b200", at + timedelta(days=7), "8.8")
    result = book.book("a", at + timedelta(days=7, minutes=1)).records[0]
    assert result.move_pct == "5.000000"
    assert result.profit == "2.980000"


def test_no_fake_history_or_late_settlement(book):
    at = datetime(2026, 9, 25, tzinfo=UTC)
    with pytest.raises(ValueError, match="Fresh"):
        book.create("a", PaperRequest(), at)
    record(book, "h100-sxm", at, "4")
    position = book.create("a", PaperRequest(days=7), at)
    assert book.book("a", at + timedelta(days=7, hours=4)).records[0].status == "open"
    record(book, "h100-sxm", at + timedelta(days=7, hours=4), "3")
    result = book.book("a", at + timedelta(days=8)).records[0]
    assert result.status == "cancelled" and result.payout == position.cost
    assert book.book("a", at + timedelta(days=9)).settled_count == 0


def test_spread_uses_first_eligible_pair_when_feeds_are_asynchronous(book):
    at = datetime(2026, 9, 25, tzinfo=UTC)
    record(book, "h100-sxm", at, "4")
    record(book, "b200", at, "8")
    book.create("a", PaperRequest(kind="generation_spread", side="call", days=7), at)
    expiry = at + timedelta(days=7)
    record(book, "h100-sxm", expiry, "4")
    record(book, "b200", expiry + timedelta(minutes=30), "8.8")
    record(book, "h100-sxm", expiry + timedelta(minutes=35), "4.2")
    record(book, "h100-sxm", expiry + timedelta(minutes=45), "3.6")
    result = book.book("a", expiry + timedelta(hours=1)).records[0]
    assert result.status == "settled" and result.move_pct == "5.000000"
    assert result.exit_prices["h100-sxm"] == "4.2"


def test_cookie_is_private_and_cross_site_writes_rejected(api_module):
    client = TestClient(api_module.app)
    at = datetime.now(UTC)
    record(api_module.strategies, "h100-sxm", at, "4")
    response = client.get("/api/v1/strategies/paper")
    assert "HttpOnly" in response.headers["set-cookie"] and "SameSite=strict" in response.headers["set-cookie"]
    assert client.post("/api/v1/strategies/paper", json={}).status_code == 201
    assert len(client.get("/api/v1/strategies/paper").json()["records"]) == 1
    assert TestClient(api_module.app).get("/api/v1/strategies/paper").json()["records"] == []
    assert client.post("/api/v1/strategies/paper", json={}, headers={"Origin": "https://foreign.example"}).status_code == 403
    assert client.post("/api/v1/strategies/paper", json={"days": 1}).status_code == 422
