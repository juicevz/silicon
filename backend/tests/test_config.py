import pytest

from app.config import SILICON_TOKEN_ADDRESS, Settings


def test_robinhood_configuration_loads_from_environment(monkeypatch):
    monkeypatch.setenv("CHAIN_ID", "4663")
    monkeypatch.setenv("FEE_BPS", "100")
    config = Settings(_env_file=None)
    assert config.chain_id == 4663 and config.fee_bps == 100


@pytest.mark.parametrize("chain_id", [1, 46630])
def test_wrong_network_cannot_start(chain_id):
    with pytest.raises(ValueError, match="Robinhood Chain 4663"):
        Settings(_env_file=None, chain_id=chain_id)


def test_official_token_is_default_and_mainnet_substitutions_are_rejected(monkeypatch):
    monkeypatch.delenv("TOKEN_ADDRESS", raising=False)
    assert Settings(_env_file=None).token_address.lower() == SILICON_TOKEN_ADDRESS
    with pytest.raises(ValueError, match="official SILICON token"):
        Settings(_env_file=None, token_address="0x" + "2" * 40)
    # Disposable contracts remain available for local integration tests.
    config = Settings(_env_file=None, rpc_url="http://127.0.0.1:8545", token_address="0x" + "2" * 40)
    assert config.token_address.lower() == "0x" + "2" * 40
