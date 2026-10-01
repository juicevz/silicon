from fastapi import APIRouter, HTTPException, Query, Request, Response

from ..alerts.models import PushSubscription
from ..compute.models import Challenge, ChallengeRequest, VerifyRequest
from .models import AdvancedAlert, AdvancedAlertRequest, AdvancedInbox, HolderAccount, SavedWorkspace, WorkspaceRequest
from .service import Holders

COOKIE = "silicon_holder"
PATH = "/api/v1/holders"


def holder_routes(service: Holders) -> APIRouter:
    router = APIRouter(prefix=PATH, tags=["Holder workspaces and alerts"])
    secure = service.settings.compute_origin.startswith("https://")

    def origin(request: Request) -> None:
        if request.headers.get("origin") != service.settings.compute_origin or request.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403, "Open holder tools from Silicon.")

    def owner(request: Request, *, write: bool = False) -> str:
        if write:
            origin(request)
        return service.auth.authenticate(request.cookies.get(COOKIE, ""), request.headers.get("x-silicon-wallet", ""))

    @router.post("/auth/challenge", response_model=Challenge)
    async def challenge(body: ChallengeRequest, request: Request, response: Response):
        origin(request)
        result, binding = service.auth.challenge(body.address, request.client.host if request.client else "unknown")
        response.set_cookie(COOKIE + "_challenge", binding, max_age=300, httponly=True, secure=secure, samesite="strict", path=PATH)
        return result

    @router.post("/auth/verify", response_model=HolderAccount)
    async def verify(body: VerifyRequest, request: Request, response: Response):
        origin(request)
        token, address = service.auth.verify(body.challenge_id, body.signature, request.cookies.get(COOKIE + "_challenge", ""))
        service.auth.logout(request.cookies.get(COOKIE, ""))
        response.set_cookie(COOKIE, token, max_age=43200, httponly=True, secure=secure, samesite="strict", path=PATH)
        response.delete_cookie(COOKIE + "_challenge", path=PATH, secure=secure, httponly=True, samesite="strict")
        return await service.account(address)

    @router.post("/auth/logout")
    async def logout(request: Request, response: Response):
        origin(request)
        service.auth.logout(request.cookies.get(COOKIE, ""))
        response.delete_cookie(COOKIE, path=PATH, secure=secure, httponly=True, samesite="strict")
        return {"ok": True}

    @router.get("/account", response_model=HolderAccount)
    async def account(request: Request):
        return await service.account(owner(request))

    @router.get("/workspaces", response_model=list[SavedWorkspace])
    async def workspaces(request: Request):
        return service.workspaces(owner(request))

    @router.post("/workspaces", response_model=SavedWorkspace, status_code=201)
    async def create_workspace(body: WorkspaceRequest, request: Request):
        identity = owner(request, write=True)
        await service.require_holder(identity)
        return service.save(identity, body)

    @router.put("/workspaces/{identifier}", response_model=SavedWorkspace)
    async def save_workspace(identifier: str, body: WorkspaceRequest, request: Request):
        identity = owner(request, write=True)
        await service.require_holder(identity)
        return service.save(identity, body, identifier)

    @router.delete("/workspaces/{identifier}")
    async def remove_workspace(identifier: str, request: Request, revision: int = Query(ge=1)):
        service.remove_workspace(owner(request, write=True), identifier, revision)
        return {"ok": True}

    @router.get("/alerts", response_model=AdvancedInbox)
    async def alerts(request: Request):
        identity = owner(request)
        account = await service.account(identity)
        return service.inbox(identity, account.eligible)

    @router.post("/alerts", response_model=AdvancedAlert, status_code=201)
    async def create_alert(body: AdvancedAlertRequest, request: Request):
        identity = owner(request, write=True)
        await service.require_holder(identity)
        return service.create_alert(identity, body)

    @router.delete("/alerts/{identifier}")
    async def remove_alert(identifier: str, request: Request):
        service.remove_alert(owner(request, write=True), identifier)
        return {"ok": True}

    @router.post("/alerts/read")
    async def read(request: Request):
        identity = service.alert_owner(owner(request, write=True))
        with service.db:
            service.db.execute("UPDATE alert_events SET read=1 WHERE owner=?", (identity,))
        return {"ok": True}

    @router.post("/alerts/push")
    async def subscribe(body: PushSubscription, request: Request):
        identity = owner(request, write=True)
        await service.require_holder(identity)
        if not service.alerts.inbox(service.alert_owner(identity)).push_available:
            raise HTTPException(503, "Browser push is unavailable. Alerts still reach your saved inbox.")
        try:
            service.alerts.subscribe(service.alert_owner(identity), body)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        return {"ok": True}

    @router.delete("/alerts/push/subscription")
    async def unsubscribe(request: Request):
        service.alerts.unsubscribe(service.alert_owner(owner(request, write=True)))
        return {"ok": True}

    return router
