from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ..catalog import MarketId


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class ModelInfo(BaseModel):
    id: str
    name: str
    description: str
    input_per_million: str | None = None
    output_per_million: str | None = None
    context_length: int | None = None
    available: bool = False
    tools: bool = False


class ComputeCatalog(BaseModel):
    enabled: bool
    models: list[ModelInfo]


class ChallengeRequest(StrictModel):
    address: str = Field(pattern=r"^0x[0-9a-fA-F]{40}$")


class Challenge(BaseModel):
    id: str
    message: str
    expires_at: int


class VerifyRequest(StrictModel):
    challenge_id: str = Field(min_length=20, max_length=80)
    signature: str = Field(pattern=r"^0x[0-9a-fA-F]{130}$")


class ComputeAccount(BaseModel):
    address: str
    available_usd: str
    used_usd: str
    pending_usd: str
    request_count: int
    access: Literal["ready", "exhausted", "pending", "unavailable"]


class KeyRequest(StrictModel):
    name: str = Field(min_length=1, max_length=60)
    limit_usd: Decimal | None = Field(default=None, ge=0, le=100000, decimal_places=9)
    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Give this key a name")
        return value


class KeyUpdate(StrictModel):
    limit_usd: Decimal | None = Field(default=None, ge=0, le=100000, decimal_places=9)
    paused: bool | None = None

    @model_validator(mode="after")
    def nonempty(self):
        if not self.model_fields_set:
            raise ValueError("Choose a spending limit or pause state")
        if "paused" in self.model_fields_set and self.paused is None:
            raise ValueError("Pause must be true or false")
        return self


class KeyInfo(BaseModel):
    id: str
    name: str
    prefix: str
    created_at: int
    last_used_at: int | None
    revoked: bool
    paused: bool = False
    limit_usd: str | None = None
    used_usd: str = "0.000000000"
    pending_usd: str = "0.000000000"
    available_usd: str | None = None
    request_count: int = 0


class CreatedKey(BaseModel):
    key: str
    info: KeyInfo


class UsageRecord(BaseModel):
    key_id: str | None = None
    key_name: str | None = None
    id: str
    model: str
    mode: str
    status: str
    cost_usd: str | None
    prompt_tokens: int | None
    completion_tokens: int | None
    created_at: int


class ChatMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class AssistantRequest(StrictModel):
    mode: Literal["chat", "market", "strategy"] = "chat"
    model: str = Field(min_length=1, max_length=120)
    market: MarketId = "h100-sxm"
    messages: list[ChatMessage] = Field(min_length=1, max_length=16)
    request_id: str = Field(pattern=r"^[a-zA-Z0-9-]{16,64}$")
    @model_validator(mode="after")
    def last_message(self):
        if self.messages[-1].role != "user":
            raise ValueError("End with a user message")
        return self


class SourceLink(BaseModel):
    title: str
    url: str
    observed_at: str | None = None


class StrategyDraft(StrictModel):
    kind: Literal["trend", "generation_spread"]
    side: Literal["call", "put"]
    days: Literal[7, 14, 30]
    units: Decimal = Field(ge=1, le=100, decimal_places=3)
    premium_per_unit: Decimal = Field(ge=Decimal("0.1"), le=Decimal("9.9"), decimal_places=6)
    scenario_move_pct: float = Field(ge=-15, le=15)
    h100_move_pct: float = Field(default=0, ge=-15, le=15)
    thesis: str = Field(min_length=1, max_length=600)
    assumptions: list[str] = Field(min_length=1, max_length=5)
    @field_validator("assumptions")
    @classmethod
    def bound_assumptions(cls, value: list[str]) -> list[str]:
        if any(len(item) > 300 for item in value):
            raise ValueError("Assumption too long")
        return value


class AssistantReply(BaseModel):
    id: str
    model: str
    content: str
    sources: list[SourceLink]
    draft: StrategyDraft | None = None
    cost_usd: str | None
    accounting: Literal["settled", "pending"]


class GatewayMessage(StrictModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str | None = Field(default=None, max_length=24000)
    name: str | None = Field(default=None, max_length=64)
    tool_call_id: str | None = Field(default=None, max_length=200)
    tool_calls: list[dict[str, Any]] | None = Field(default=None, max_length=16)


class CompletionRequest(StrictModel):
    model: str = Field(min_length=1, max_length=120)
    messages: list[GatewayMessage] = Field(min_length=1, max_length=64)
    max_tokens: int = Field(default=1024, ge=1, le=4096)
    max_completion_tokens: int | None = Field(default=None, ge=1, le=4096)
    temperature: float | None = Field(default=None, ge=0, le=2)
    stream: bool = False
    stream_options: dict[str, bool] | None = None
    tools: list[dict[str, Any]] | None = Field(default=None, max_length=16)
    tool_choice: str | dict[str, Any] | None = None
    response_format: dict[str, Any] | None = None

    @field_validator("tools")
    @classmethod
    def local_function_tools(cls, value: list[dict[str, Any]] | None):
        if value is not None and any(tool.get("type") != "function" or set(tool) != {"type", "function"} or not isinstance(tool.get("function"), dict) for tool in value):
            raise ValueError("Only client-executed function tools are supported")
        return value

    @field_validator("response_format")
    @classmethod
    def text_output_only(cls, value: dict[str, Any] | None):
        if value is not None and value.get("type") not in {"text", "json_object", "json_schema"}:
            raise ValueError("Unsupported response format")
        return value
