import base64
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, model_validator

from ..catalog import MarketId


class AlertRequest(BaseModel):
    market: MarketId
    kind: Literal["price", "provider", "recovery"] = "price"
    direction: Literal["above", "below"] = "above"
    price: float | None = Field(default=None, gt=0, lt=1000, allow_inf_nan=False)

    @model_validator(mode="after")
    def terms(self):
        if self.kind == "price" and self.price is None:
            raise ValueError("A price alert needs a threshold")
        if self.kind == "recovery" and self.market != "h100-sxm":
            raise ValueError("Recovery alerts watch the H100 benchmark")
        return self


class AlertRule(AlertRequest):
    id: str
    created_at: str
    expires_at: str
    triggered_at: str | None = None


class AlertEvent(BaseModel):
    id: str
    alert_id: str
    market: str
    message: str
    created_at: str
    source_time: str | None
    receipt_hash: str | None
    read: bool
    delivery: Literal["inbox", "pending", "sent", "failed"]


class AlertInbox(BaseModel):
    rules: list[AlertRule]
    events: list[AlertEvent]
    push_enabled: bool
    push_available: bool
    vapid_public_key: str | None
    limit: int = 20


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=80, max_length=100)
    auth: str = Field(min_length=20, max_length=30)

    @model_validator(mode="after")
    def validate_keys(self):
        try:
            public = base64.urlsafe_b64decode(self.p256dh + "=" * (-len(self.p256dh) % 4))
            auth = base64.urlsafe_b64decode(self.auth + "=" * (-len(self.auth) % 4))
            if len(public) != 65 or public[0] != 4 or len(auth) != 16:
                raise ValueError()
        except Exception as exc:
            raise ValueError("Invalid push keys") from exc
        return self


class PushSubscription(BaseModel):
    endpoint: str = Field(max_length=2048)
    keys: PushKeys

    @model_validator(mode="after")
    def public_push_service(self):
        url = urlparse(self.endpoint)
        # Exact browser push-service hosts only. No user-controlled URLs, ports,
        # redirects or private hosts may become an outbound network request.
        allowed = url.hostname in {"fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"}
        windows = bool(url.hostname and url.hostname.endswith(".notify.windows.com"))
        if url.scheme != "https" or not (allowed or windows) or url.port not in (None, 443) or url.username or url.password or url.fragment:
            raise ValueError("Unsupported browser push service")
        return self
