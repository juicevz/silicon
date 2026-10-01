import asyncio
import json
import re
import secrets
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from time import monotonic, time
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse

from .chain import Chain
from .benefits import wallet_benefits
from .catalog import MarketId
from .config import settings
from .market_data import H100_BASKET, METHOD, MarketData, age
from .models import (
    Access,
    Benefits,
    Leaderboard,
    Portfolio,
    Protocol,
    PublicConfig,
    Quote,
    QuoteRequest,
    Snapshot,
    TransactionRequest,
    ReviewedTransaction,
)
from .protocol import ProtocolReader
from .pricing import preview
from .store import Store, now
from .transactions import Transactions
from .strategies import PaperBook, PaperRecord, PaperRequest, Strategies, StrategyOverview
from .insights import MarketContext, VaultAccounting, market_context, vault_accounting
from .alerts.service import Alerts
from .alerts.routes import alert_routes
from .movers import Movers, daily_movers
from .rental_planner import RentalPlanRequest, RentalPlan, rental_plan
from .compute.service import ComputeService
from .compute.routes import compute_routes
from .holders.service import Holders
from .holders.routes import holder_routes

config = settings()
store = Store(config.data_dir)
data = MarketData(config, store)
chain = Chain(config)
reader = ProtocolReader(chain, store)
round_readers = {address.lower(): ProtocolReader(chain, store, address) for address in config.vault_round_addresses if address.lower() != config.market_address.lower()}
transactions = Transactions(chain, reader, round_readers)
strategies = Strategies(store)
compute = ComputeService(config, store, data, reader)
alerts = Alerts(config, store, data)
holders = Holders(chain, alerts)
rate_limits: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def require_fresh_benchmark() -> None:
    market = data.markets["h100-sxm"]
    if (
        market.stale
        or not -300 <= age(market.source_updated_at) <= config.source_stale_seconds
    ):
        raise HTTPException(
            409, "The rental benchmark is stale. Trading is unavailable."
        )


def execution_ready() -> bool:
    if not reader.snapshot.verified or not reader.snapshot.contracts:
        return False
    series = reader.snapshot.contracts[0]
    market = data.markets["h100-sxm"]
    return bool(
        config.trading_enabled
        and series.phase == "open"
        and not series.paused
        and series.quote_valid_until > time()
        and float(series.available) > 0
        and not market.stale
        and -300 <= age(market.source_updated_at) <= config.source_stale_seconds
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
        *(asyncio.create_task(repeat(r.poll, 60)) for r in round_readers.values()),
        asyncio.create_task(repeat(compute.reconcile, 60)),
        asyncio.create_task(repeat(alerts.poll, 30)),
        asyncio.create_task(repeat(holders.poll, 30)),
    ]
    yield
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await compute.close()
    store.close()


app = FastAPI(
    title="Silicon API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.include_router(compute_routes(compute))
app.include_router(alert_routes(alerts))
app.include_router(holder_routes(holders))


@app.exception_handler(RequestValidationError)
async def safe_validation(request: Request, exc: RequestValidationError):
    if request.url.path.startswith(("/api/v1/compute", "/api/v1/holders")) or request.url.path == "/api/v1/chat/completions":
        return JSONResponse({"detail": "Check the request fields and supported limits."}, status_code=422)
    return await request_validation_exception_handler(request, exc)


@app.middleware("http")
async def security(request: Request, call_next):
    is_compute = request.url.path.startswith("/api/v1/compute") or request.url.path in {"/api/v1/chat/completions", "/api/v1/models", "/api/v1/key"}
    is_alerts = request.url.path.startswith("/api/v1/alerts")
    is_holders = request.url.path.startswith("/api/v1/holders")
    if (is_compute or is_alerts or is_holders) and request.method in {"POST", "PUT", "PATCH"}:
        length = request.headers.get("content-length", "0")
        if not length.isdigit() or int(length) > 96000:
            return JSONResponse({"detail": "Request too large."}, status_code=413)
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > 96000:
                return JSONResponse({"detail": "Request too large."}, status_code=413)
            body.extend(chunk)
        request._body = bytes(body)  # Starlette replays this bounded body downstream.
    if (
        request.url.path.startswith("/api/v1/access")
        or request.url.path in {"/api/v1/quote", "/api/v1/rental-plan"}
        or request.url.path.startswith("/api/v1/transactions")
        or request.url.path.startswith("/api/v1/strategies/paper")
        or is_compute
        or is_alerts
        or is_holders
    ):
        host = request.client.host if request.client else "unknown"
        transaction = request.url.path.startswith("/api/v1/transactions")
        group, limit = (
            ("holders", 90)
            if is_holders
            else
            ("alerts", 60)
            if is_alerts
            else ("compute", 60)
            if is_compute
            else ("confirmation", 180)
            if transaction and request.method == "GET"
            else ("transaction", 30)
            if transaction
            else ("quotes", 60)
        )
        key = (host, group)
        at = monotonic()
        if len(rate_limits) > 10000:
            rate_limits.clear()
        bucket = rate_limits[key]
        while bucket and bucket[0] < at - 60:
            bucket.popleft()
        if len(bucket) >= limit:
            return JSONResponse(
                {"detail": "Too many requests. Please wait a moment."},
                status_code=429,
                headers={"Retry-After": str(max(1, int(61 - (at - bucket[0]))))},
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
        vault_round_addresses=config.vault_round_addresses,
        usdg_address=config.usdg_address,
        dev_wallet_address=config.dev_wallet_address or None,
        fee_bps=config.fee_bps,
        trading_enabled=execution_ready(),
    )


@app.get("/api/v1/markets", response_model=Snapshot)
async def snapshot():
    # SQLite collection and SSE run on this event loop. Keep these short reads
    # here too, rather than sharing its statement cache across worker threads.
    return Snapshot(
        markets=data.snapshot(),
        network=chain.network,
        server_time=now(),
        collection_interval=config.collection_interval,
        trading_enabled=execution_ready(),
    )


@app.post("/api/v1/rental-plan", response_model=RentalPlan)
async def plan_rental(body: RentalPlanRequest):
    return rental_plan(body, data.markets[body.market], config)


@app.get("/api/v1/movers", response_model=Movers)
async def movers():
    return daily_movers(store, data.snapshot())


@app.get("/api/v1/history/{market}")
async def history(market: str, range: Literal["1h", "6h", "24h", "7d", "14d", "30d"] = "24h"):
    if market not in data.markets:
        raise HTTPException(404, "Unknown market")
    return {"points": store.history(market, int(range[:-1]) * (24 if range.endswith("d") else 1)), "range": range}


@app.get("/api/v1/markets/{market}/context", response_model=MarketContext)
async def context(market: MarketId):
    return market_context(data.markets[market], reader.snapshot, config, store)


@app.get("/api/v1/vaults/{address}/accounting", response_model=VaultAccounting)
async def accounting(address: str):
    selected = reader if address.lower() == reader.address.lower() else round_readers.get(address.lower())
    if selected is None or not selected.address:
        raise HTTPException(404, "This round is not configured.")
    return vault_accounting(selected.snapshot, store)


def paper_session(request: Request, response: Response) -> str:
    token = request.cookies.get("silicon_paper", "")
    if not re.fullmatch(r"[0-9a-f]{64}", token):
        token = secrets.token_hex(32)
    response.set_cookie("silicon_paper", token, max_age=31536000, httponly=True,
                        secure=request.url.scheme == "https", samesite="strict", path="/api/v1/strategies")
    return token


@app.get("/api/v1/strategies", response_model=StrategyOverview)
async def strategy_overview():
    return strategies.overview()


@app.get("/api/v1/strategies/paper", response_model=PaperBook)
async def paper_book(request: Request, response: Response):
    return strategies.book(paper_session(request, response))


@app.post("/api/v1/strategies/paper", response_model=PaperRecord, status_code=201)
async def create_paper_strategy(body: PaperRequest, request: Request, response: Response):
    origin = request.headers.get("origin")
    if request.headers.get("sec-fetch-site") == "cross-site" or (origin and origin != str(request.base_url).rstrip("/")):
        raise HTTPException(403, "Start paper strategies from this site.")
    try:
        return strategies.create(paper_session(request, response), body)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


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
        "monitoring_models": "All other GPU models use the median of each provider’s cheapest eligible USD on-demand instance listing, with at least three distinct providers. They are comparison references, not tradable benchmarks.",
    }


@app.get("/api/v1/receipts")
async def receipts(market: MarketId = "h100-sxm"):
    return {
        "receipts": store.receipts(market),
        "hash_method": "keccak256 of canonical JSON, sorted keys, compact separators",
    }


@app.get("/api/v1/receipts/{digest}")
async def receipt(digest: str):
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
                and -300 <= age(market.source_updated_at) <= config.source_stale_seconds
            ):
                return live
        except Exception:
            pass
    fee = config.fee_bps
    if request.address:
        try:
            access = await chain.access(request.address)
            # Holder workspace access does not alter a legacy round's immutable
            # fee token. Keep its calculator consistent with the actual round.
            if reader.snapshot.verified and reader.snapshot.token_configured:
                fee = access.fee_bps
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    return preview(request, data.markets[request.market].price, fee)


@app.get("/api/v1/protocol", response_model=Protocol)
def protocol():
    return reader.snapshot


@app.get("/api/v1/benefits/{address}", response_model=Benefits)
async def benefits(address: str):
    try:
        return await wallet_benefits(chain, [reader, *round_readers.values()], address)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/v1/vaults", response_model=list[Protocol])
async def vaults():
    return [r.snapshot for r in [reader, *round_readers.values()] if r.address]


@app.get("/api/v1/portfolio/{address}", response_model=Portfolio)
async def portfolio(address: str, series: str | None = None):
    selected = reader if not series or series.lower() == reader.address.lower() else round_readers.get(series.lower())
    if selected is None:
        raise HTTPException(404, "Unknown vault round")
    try:
        return await selected.portfolio(address)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, "Portfolio data is temporarily unavailable") from exc


@app.get("/api/v1/leaderboard", response_model=Leaderboard)
def leaderboard(period: Literal["24h", "7d", "30d"] = "7d"):
    return reader.leaderboard(period)


@app.post("/api/v1/transactions/review", response_model=ReviewedTransaction)
async def review_transaction(request: TransactionRequest):
    if request.action == "buy":
        require_fresh_benchmark()
    try:
        return await transactions.review(request)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            503, "Robinhood transaction review is temporarily unavailable"
        ) from exc


@app.get("/api/v1/transactions/{signature}")
async def transaction_status(signature: str):
    try:
        return await transactions.status(signature)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            503, "Robinhood confirmation is temporarily unavailable"
        ) from exc


@app.get("/api/v1/transactions/{signature}/replacement/{replacement}")
async def transaction_replacement(signature: str, replacement: str):
    try:
        return await transactions.replacement(signature, replacement)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, "Robinhood replacement verification is temporarily unavailable") from exc


@app.get("/api/v1/stream")
async def stream(request: Request):
    async def events():
        while not await request.is_disconnected():
            yield "data: " + json.dumps((await snapshot()).model_dump()) + "\n\n"
            await asyncio.sleep(15)

    return StreamingResponse(
        events(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"}
    )
