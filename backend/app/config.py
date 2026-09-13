from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")
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


@lru_cache
def settings() -> Settings:
    return Settings()
