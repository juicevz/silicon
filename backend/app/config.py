from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from eth_utils import is_address, to_checksum_address
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env", extra="ignore", hide_input_in_errors=True
    )
    data_dir: Path = Path("../data")
    rpc_url: str = "https://rpc.mainnet.chain.robinhood.com/"
    chain_id: int = 4663
    explorer_url: str = "https://robinhoodchain.blockscout.com"
    usdg_address: str = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"
    token_address: str = ""
    market_address: str = ""
    market_start_block: int = 0
    privy_app_id: str = ""
    collection_interval: int = 180
    source_stale_seconds: int = 10800
    fee_bps: int = 100
    trading_enabled: bool = False
    dev_wallet_address: str = ""

    @model_validator(mode="after")
    def validate_network(self):
        if self.chain_id != 4663:
            raise ValueError("Silicon requires Robinhood Chain 4663")
        if self.fee_bps != 100:
            raise ValueError("The configured trading fee must be 100 basis points")
        endpoint = urlparse(self.rpc_url)
        local = endpoint.hostname in {"127.0.0.1", "localhost", "::1"}
        if endpoint.scheme != "https" and not (endpoint.scheme == "http" and local):
            raise ValueError("RPC must use HTTPS or loopback HTTP")
        for name in (
            "usdg_address",
            "token_address",
            "market_address",
            "dev_wallet_address",
        ):
            value = getattr(self, name)
            if value:
                if not is_address(value) or int(value, 16) == 0:
                    raise ValueError(f"Invalid {name}")
                setattr(self, name, to_checksum_address(value))
        if (
            not local
            and self.usdg_address.lower()
            != "0x5fc5360d0400a0fd4f2af552add042d716f1d168"
        ):
            raise ValueError("USDG must match the Robinhood Chain token")
        return self


@lru_cache
def settings() -> Settings:
    return Settings()
