import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location("publisher", Path(__file__).resolve().parents[2] / "scripts/prepare_series_tx.py")
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


def market(**overrides):
    return {"markets": [{"id": "h100-sxm", "stale": False, "status": "benchmark", "coverage": 5, "source_updated_at": "2026-10-01T20:00:00+00:00", "price": 3.9, **overrides}]}


@pytest.mark.parametrize("overrides", [{"coverage": 4}, {"status": "withheld"}, {"stale": True}, {"price": "NaN"}])
def test_publisher_refuses_withheld_or_invalid_current_benchmark(overrides):
    with pytest.raises(ValueError):
        publisher.current_quote_observation(market(**overrides), 1790885400)


def test_publisher_requires_current_complete_observation_within_freshness_window():
    observed, price = publisher.current_quote_observation(market(), 1790885400)
    assert observed == 1790884800 and str(price) == "3.9"
    with pytest.raises(ValueError):
        publisher.current_quote_observation(market(), observed + 10801)
