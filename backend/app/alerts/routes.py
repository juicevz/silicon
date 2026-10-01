import re
import secrets

from fastapi import APIRouter, HTTPException, Request, Response

from .models import AlertInbox, AlertRequest, AlertRule, PushSubscription
from .service import Alerts


def alert_routes(service: Alerts) -> APIRouter:
    router = APIRouter(prefix="/api/v1/alerts", tags=["Background alerts"])

    def owner(request: Request, response: Response, *, write: bool = False) -> str:
        origin = request.headers.get("origin")
        if request.headers.get("sec-fetch-site") == "cross-site" or (origin and origin != str(request.base_url).rstrip("/")):
            raise HTTPException(403, "Manage alerts from Silicon.")
        token = request.cookies.get("silicon_alerts", "")
        if not re.fullmatch(r"[0-9a-f]{64}", token):
            if write:
                raise HTTPException(401, "Open the alert inbox before saving alerts.")
            token = secrets.token_hex(32)
        response.set_cookie("silicon_alerts", token, max_age=90 * 86400, httponly=True,
                            secure=request.url.scheme == "https", samesite="strict", path="/api/v1/alerts")
        try:
            return service.owner(token)
        except ValueError as exc:
            raise HTTPException(503, str(exc)) from exc

    @router.get("", response_model=AlertInbox)
    async def inbox(request: Request, response: Response):
        return service.inbox(owner(request, response))

    @router.post("", response_model=AlertRule, status_code=201)
    async def create(body: AlertRequest, request: Request, response: Response):
        identity = owner(request, response, write=True)
        try:
            return service.create(identity, body)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @router.delete("/{rule_id}")
    async def remove(rule_id: str, request: Request, response: Response):
        service.remove(owner(request, response, write=True), rule_id)
        return {"ok": True}

    @router.post("/read")
    async def read(request: Request, response: Response):
        identity = owner(request, response, write=True)
        with service.db:
            service.db.execute("UPDATE alert_events SET read=1 WHERE owner=?", (identity,))
        return {"ok": True}

    @router.post("/push")
    async def subscribe(body: PushSubscription, request: Request, response: Response):
        identity = owner(request, response, write=True)
        if not service.inbox(identity).push_available:
            raise HTTPException(503, "Browser push is not configured. Server monitoring and the inbox are available.")
        try:
            service.subscribe(identity, body)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        return {"ok": True}

    @router.delete("/push/subscription")
    async def unsubscribe(request: Request, response: Response):
        service.unsubscribe(owner(request, response, write=True))
        return {"ok": True}

    return router
