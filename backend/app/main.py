import asyncio
import json
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from time import monotonic, time
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse

from .chain import Chain
from .config import settings
from .market_data import H100_BASKET, METHOD, MarketData, age
from .models import (
    Access,
    Leaderboard,
    Portfolio,
    Protocol,
    PublicConfig,
    Quote,
    QuoteRequest,
    Snapshot,
)
from .protocol import ProtocolReader
from .pricing import preview
from .store import Store, now

config = settings()
store = Store(config.data_dir)
data = MarketData(config, store)
chain = Chain(config)
reader = ProtocolReader(chain, store)
rate_limits: dict[str, deque[float]] = defaultdict(deque)


def execution_ready() -> bool:
    if not reader.snapshot.verified or not reader.snapshot.contracts:
        return False
    series = reader.snapshot.contracts[0]
    market = data.markets["h100-sxm"]
    return bool(
        config.token_address
        and series.phase == "open"
        and not series.paused
        and series.quote_valid_until > time()
        and float(series.available) > 0
        and not market.stale
        and age(market.source_updated_at) <= config.source_stale_seconds
    )


async def repeat(fn, seconds: int) -> None:
    while True:
        try:
            await fn()
        except Exception:
            pass  # Individual collectors expose failures through status and timestamp.
        await asyncio.sleep(seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(repeat(data.collect, config.collection_interval)),
        asyncio.create_task(repeat(chain.poll, 15)),
        asyncio.create_task(repeat(reader.poll, 20)),
    ]
    yield
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    store.close()


app = FastAPI(
    title="Silicon API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


@app.middleware("http")
async def security(request: Request, call_next):
    if (
        request.url.path.startswith("/api/v1/access")
        or request.url.path == "/api/v1/quote"
    ):
        key = request.client.host if request.client else "unknown"
        at = monotonic()
        if len(rate_limits) > 10000:
            rate_limits.clear()
        bucket = rate_limits[key]
        while bucket and bucket[0] < at - 60:
            bucket.popleft()
        if len(bucket) >= 60:
            from fastapi.responses import JSONResponse

            return JSONResponse(
                {"detail": "Too many requests. Please wait a moment."}, status_code=429
            )
        bucket.append(at)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
def health():
    return {"ok": True, "service": "silicon-api", "time": now()}


@app.get("/api/v1/config", response_model=PublicConfig)
def public_config():
    return PublicConfig(
        privy_app_id=config.privy_app_id,
        chain_id=config.chain_id,
        explorer_url=config.explorer_url,
        token_address=config.token_address or None,
        market_address=config.market_address or None,
        usdg_address=config.usdg_address,
        fee_bps=config.fee_bps,
        trading_enabled=execution_ready(),
    )


@app.get("/api/v1/markets", response_model=Snapshot)
def snapshot():
    return Snapshot(
        markets=data.snapshot(),
        network=chain.network,
        server_time=now(),
        collection_interval=config.collection_interval,
        trading_enabled=execution_ready(),
    )


@app.get("/api/v1/history/{market}")
def history(market: str, range: Literal["1h", "6h", "24h"] = "24h"):
    if market not in data.markets:
        raise HTTPException(404, "Unknown market")
    return {"points": store.history(market, int(range[:-1])), "range": range}


@app.get("/api/v1/methodology")
def methodology():
    return {
        "id": METHOD,
        "name": "Silicon H100 rental reference",
        "method": "Equal-provider median of five fixed USD on-demand full-instance H100 SXM listings, normalized per GPU-hour. All five quotes must be confirmed within three hours. No automatic substitutions.",
        "constituents": [
            {"provider_id": key, "instance": value[0], "region": value[1]}
            for key, value in H100_BASKET.items()
        ],
        "base": "100 at the first stored observation. A funded series fixes its own starting reference.",
        "source": "https://gpueconomy.com/data",
        "license": "CC BY 4.0",
        "exclusions": [
            "spot",
            "reserved",
            "non-USD",
            "GPU-only",
            "marketplace floors",
            "unconfirmed quotes",
        ],
        "settlement": "Operator-published result with a one-hour challenge window; unresolved or missing result cancels after 24 hours and refunds premiums and fees.",
        "monitoring_models": "A100 and B200 use the median of each provider’s cheapest eligible listed region. They are comparison references, not tradable benchmarks.",
    }


@app.get("/api/v1/receipts")
def receipts(market: Literal["h100-sxm", "a100-80", "b200"] = "h100-sxm"):
    return {
        "receipts": store.receipts(market),
        "hash_method": "keccak256 of canonical JSON, sorted keys, compact separators",
    }


@app.get("/api/v1/receipts/{digest}")
def receipt(digest: str):
    value = store.receipt(digest)
    if value is None:
        raise HTTPException(404, "Unknown observation receipt")
    return value


@app.get("/api/v1/access/{address}", response_model=Access)
async def access(address: str):
    try:
        return await chain.access(address)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/v1/quote", response_model=Quote)
async def quote(request: QuoteRequest):
    if request.address:
        try:
            live = await reader.quote(request)
            market = data.markets[request.market]
            if (
                live
                and not market.stale
                and age(market.source_updated_at) <= config.source_stale_seconds
            ):
                return live
        except Exception:
            pass
    fee = config.fee_bps
    if request.address:
        try:
            access = await chain.access(request.address)
            fee = access.fee_bps
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    return preview(request, data.markets[request.market].price, fee)


@app.get("/api/v1/protocol", response_model=Protocol)
def protocol():
    return reader.snapshot


@app.get("/api/v1/portfolio/{address}", response_model=Portfolio)
async def portfolio(address: str):
    try:
        return await reader.portfolio(address)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, "Portfolio data is temporarily unavailable") from exc


@app.get("/api/v1/leaderboard", response_model=Leaderboard)
def leaderboard(period: Literal["24h", "7d", "30d"] = "7d"):
    return reader.leaderboard(period)


@app.get("/api/v1/stream")
async def stream(request: Request):
    async def events():
        while not await request.is_disconnected():
            yield "data: " + json.dumps(snapshot().model_dump()) + "\n\n"
            await asyncio.sleep(15)

    return StreamingResponse(
        events(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"}
    )
