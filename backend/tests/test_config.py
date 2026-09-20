import pytest

from app.config import Settings


def test_robinhood_configuration_loads_from_environment(monkeypatch):
    monkeypatch.setenv("CHAIN_ID", "4663")
    monkeypatch.setenv("FEE_BPS", "100")
    config = Settings(_env_file=None)
    assert config.chain_id == 4663 and config.fee_bps == 100


@pytest.mark.parametrize("chain_id", [1, 46630])
def test_wrong_network_cannot_start(chain_id):
    with pytest.raises(ValueError, match="Robinhood Chain 4663"):
        Settings(_env_file=None, chain_id=chain_id)
