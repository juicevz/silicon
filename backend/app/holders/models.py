from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..alerts.models import AlertEvent
from ..catalog import MarketId


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class SavedTemplate(Strict):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    spread: bool
    side: Literal["call", "put"]
    days: Literal[7, 14, 30]
    units: float = Field(ge=1, le=100, allow_inf_nan=False)
    premium: str = Field(pattern=r"^\d{1,2}(\.\d{1,6})?$")
    thesis: str = Field(max_length=600)

    @field_validator("premium")
    @classmethod
    def valid_premium(cls, value: str) -> str:
        if not .1 <= float(value) <= 9.9:
            raise ValueError("Premium must be between 0.1 and 9.9")
        return value


class WorkspaceState(Strict):
    market: MarketId = "h100-sxm"
    range: Literal["1h", "6h", "24h"] = "24h"
    filter: str = Field(default="", max_length=80)
    watchlist: list[MarketId] = Field(default_factory=list, max_length=16)
    notes: str = Field(default="", max_length=10000)
    templates: list[SavedTemplate] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def unique(self):
        if len(set(self.watchlist)) != len(self.watchlist) or len({t.id for t in self.templates}) != len(self.templates):
            raise ValueError("Watchlist and template IDs must be unique")
        return self


class WorkspaceRequest(Strict):
    name: str = Field(min_length=1, max_length=60)
    state: WorkspaceState
    revision: int = Field(default=0, ge=0)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        name = " ".join(value.split())
        if not name:
            raise ValueError("Name the workspace")
        return name


class SavedWorkspace(WorkspaceRequest):
    id: str
    updated_at: str


class HolderAccount(BaseModel):
    address: str
    eligible: bool
    verified: bool
    reason: str | None = None
    workspace_limit: int = 5
    alert_limit: int = 100


class AlertCondition(Strict):
    market: MarketId = "h100-sxm"
    kind: Literal["price", "change", "benchmark"] = "price"
    direction: Literal["above", "below"] = "below"
    threshold: float | None = Field(default=None, ge=-99, le=1000, allow_inf_nan=False)

    @model_validator(mode="after")
    def terms(self):
        if self.kind == "benchmark":
            if self.market != "h100-sxm" or self.threshold is not None:
                raise ValueError("Benchmark condition watches all five H100 providers")
        elif self.threshold is None or (self.kind == "price" and self.threshold <= 0):
            raise ValueError("Enter a valid threshold")
        return self


class AdvancedAlertRequest(Strict):
    name: str = Field(min_length=1, max_length=80)
    conditions: list[AlertCondition] = Field(min_length=1, max_length=3)
    recurring: bool = True
    cooldown_minutes: Literal[5, 15, 30, 60, 240, 1440] = 60

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        name = " ".join(value.split())
        if not name:
            raise ValueError("Name the alert")
        return name


class AdvancedAlert(AdvancedAlertRequest):
    id: str
    created_at: str
    expires_at: str
    last_triggered_at: str | None = None
    status: Literal["watching", "waiting_data", "cooldown", "waiting_reset", "paused", "complete", "expired"]


class AdvancedInbox(BaseModel):
    rules: list[AdvancedAlert]
    events: list[AlertEvent]
    push_enabled: bool
    push_available: bool
    vapid_public_key: str | None
    limit: int = 100
