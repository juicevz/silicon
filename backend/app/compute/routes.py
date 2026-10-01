import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.parse import urlparse

from eth_account import Account
from eth_account.messages import encode_defunct
from eth_keys.exceptions import BadSignature
from eth_utils import to_checksum_address
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from .models import (
    AssistantReply, AssistantRequest, Challenge, ChallengeRequest,
    CompletionRequest, ComputeAccount, ComputeCatalog, CreatedKey,
    KeyInfo, KeyRequest, KeyUpdate, UsageRecord, VerifyRequest,
)
from .service import ComputeService

COOKIE = "silicon_compute"


def compute_routes(service: ComputeService) -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["Compute"])
    settings, ledger = service.settings, service.ledger

    def origin(request: Request) -> None:
        if request.headers.get("origin") != settings.compute_origin:
            raise HTTPException(403, "Open Compute from the Silicon website.")

    def session(request: Request, *, write: bool = False) -> str:
        if write:
            origin(request)
        return ledger.authenticate(request.cookies.get(COOKIE, ""))

    def api_owner(request: Request) -> tuple[str, str]:
        authorization = request.headers.get("authorization", "")
        if not authorization.startswith("Bearer "):
            raise HTTPException(401, "Use your Silicon API key as a Bearer token.")
        return ledger.authenticate_key(authorization[7:])

    def require_enabled() -> None:
        if not service.provider.enabled:
            raise HTTPException(503, "Compute is currently unavailable.")

    @router.get("/compute/models", response_model=ComputeCatalog)
    async def models():
        return await service.provider.catalog()

    @router.post("/compute/auth/challenge", response_model=Challenge)
    async def challenge(body: ChallengeRequest, request: Request):
        origin(request)
        require_enabled()
        if int(body.address, 16) == 0:
            raise HTTPException(400, "Choose a wallet to sign in.")
        challenge_id = secrets.token_urlsafe(24)
        issued = datetime.now(UTC)
        expires = issued + timedelta(minutes=5)
        message = (f"{urlparse(settings.compute_origin).netloc} wants you to sign in with your Ethereum account:\n"
                   f"{to_checksum_address(body.address)}\n\nSign in to Silicon Compute. This does not authorize transactions.\n\n"
                   f"URI: {settings.compute_origin}/compute\nVersion: 1\nChain ID: 4663\n"
                   f"Nonce: {secrets.token_hex(16)}\nIssued At: {issued.isoformat()}\nExpiration Time: {expires.isoformat()}")
        ledger.challenge(body.address, message, challenge_id, request.client.host if request.client else "unknown")
        return Challenge(id=challenge_id, message=message, expires_at=int(expires.timestamp()))

    @router.post("/compute/auth/verify", response_model=ComputeAccount)
    async def verify(body: VerifyRequest, request: Request, response: Response):
        origin(request)
        require_enabled()
        challenge = ledger.pending_challenge(body.challenge_id)
        try:
            recovered = Account.recover_message(encode_defunct(text=challenge["message"]), signature=body.signature).lower()
        except (ValueError, TypeError, BadSignature):
            raise HTTPException(401, "The wallet signature could not be verified.") from None
        if recovered != challenge["address"]:
            raise HTTPException(401, "Sign with the wallet that started this request.")
        token = ledger.sign_in(body.challenge_id, recovered)
        response.set_cookie(COOKIE, token, max_age=43200, secure=settings.compute_origin.startswith("https://"), httponly=True, samesite="strict", path="/api/v1/compute")
        return ledger.account(recovered)

    @router.post("/compute/auth/logout", status_code=204)
    async def logout(request: Request, response: Response):
        origin(request)
        ledger.logout(request.cookies.get(COOKIE, ""))
        response.delete_cookie(COOKIE, path="/api/v1/compute", secure=settings.compute_origin.startswith("https://"), httponly=True, samesite="strict")

    @router.get("/compute/account", response_model=ComputeAccount)
    async def account(request: Request):
        return ledger.account(session(request))

    @router.get("/compute/keys", response_model=list[KeyInfo])
    async def keys(request: Request):
        return ledger.keys(session(request))

    @router.post("/compute/keys", response_model=CreatedKey, status_code=201)
    async def create_key(body: KeyRequest, request: Request):
        address = session(request, write=True)
        require_enabled()
        if ledger.account(address).access != "ready":
            raise HTTPException(403, "Your account needs active Compute access to create a key.")
        return ledger.create_key(address, body.name, body.limit_usd)

    @router.patch("/compute/keys/{key_id}", response_model=KeyInfo)
    async def update_key(key_id: str, body: KeyUpdate, request: Request):
        return ledger.update_key(session(request, write=True), key_id, body)

    @router.delete("/compute/keys/{key_id}", status_code=204)
    async def revoke_key(key_id: str, request: Request):
        ledger.revoke_key(session(request, write=True), key_id)

    @router.get("/compute/usage", response_model=list[UsageRecord])
    async def usage(request: Request, key_id: str | None = None):
        return ledger.usage(session(request), key_id)

    @router.post("/compute/chat", response_model=AssistantReply)
    async def assistant(body: AssistantRequest, request: Request):
        return await service.assistant(session(request, write=True), body)

    @router.get("/models")
    async def gateway_models(request: Request):
        api_owner(request)
        catalog = await service.provider.catalog()
        return {"object": "list", "data": [{"id": model.id, "object": "model", "created": 0, "owned_by": model.id.split("/")[0]} for model in catalog.models if model.available]}

    @router.get("/key")
    async def gateway_account(request: Request):
        address, key_id = api_owner(request)
        account, key = ledger.account(address), ledger.key(address, key_id)
        remaining = min(Decimal(account.available_usd), Decimal(key.available_usd)) if key.available_usd is not None else Decimal(account.available_usd)
        if key.paused:
            remaining = Decimal(0)
        return {"data": {"limit_remaining": str(remaining), "usage": key.used_usd, "pending": key.pending_usd,
                         "limit": key.limit_usd, "paused": key.paused, "currency": "USD",
                         "account_limit_remaining": account.available_usd}}

    @router.post("/chat/completions")
    async def completions(body: CompletionRequest, request: Request):
        address, key_id = api_owner(request)
        client_id = request.headers.get("idempotency-key") or secrets.token_hex(16)
        if not re.fullmatch(r"[a-zA-Z0-9-]{16,64}", client_id):
            raise HTTPException(400, "Use a 16 to 64 character Idempotency-Key.")
        prepared = body.model_dump(exclude_none=True)
        prepared["max_tokens"] = prepared.pop("max_completion_tokens", prepared["max_tokens"])
        if body.stream:
            request_id, upstream = await service.start(address, prepared, client_id, "api", key_id=key_id)
            return StreamingResponse(service.stream(request_id, upstream), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Silicon-Request-Id": request_id})
        request_id, payload, _cost = await service.completion(address, prepared, client_id, "api", key_id=key_id)
        clean = {name: payload[name] for name in ("id", "object", "created", "model", "choices", "usage") if name in payload}
        return Response(content=json.dumps(clean), media_type="application/json", headers={"X-Silicon-Request-Id": request_id})

    return router
