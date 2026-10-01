import asyncio
import json
from dataclasses import dataclass
from decimal import Decimal
from time import monotonic
from typing import Any

import httpx
from fastapi import HTTPException

from ..config import Settings
from .ledger import atoms
from .models import ComputeCatalog, ModelInfo


@dataclass(frozen=True)
class ModelPolicy:
    name: str
    description: str
    input_ceiling: Decimal
    output_ceiling: Decimal


MODELS = {
    "qwen/qwen3.7-flash": ModelPolicy("Qwen Flash", "Quick answers, everyday code and short research tasks.", Decimal("0.10"), Decimal("0.50")),
    "deepseek/deepseek-v4-flash-0731": ModelPolicy("DeepSeek Flash", "Work through a question, compare scenarios and draft a thesis.", Decimal("0.50"), Decimal("1.50")),
    "anthropic/claude-haiku-4.5": ModelPolicy("Claude Haiku", "Clear explanations, writing and practical coding help.", Decimal("2"), Decimal("10")),
}


class ModelProvider:
    base_url = "https://openrouter.ai/api/v1"

    def __init__(self, settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(90, connect=10), follow_redirects=False, transport=transport)
        self._catalog: list[ModelInfo] = []
        self._catalog_at = 0.0
        self._catalog_lock = asyncio.Lock()

    @property
    def enabled(self) -> bool:
        return bool(self.settings.compute_enabled and self.settings.openrouter_api_key.get_secret_value() and self.settings.compute_spend_limit_usd > 0)

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": "Bearer " + self.settings.openrouter_api_key.get_secret_value(), "HTTP-Referer": self.settings.compute_origin, "X-OpenRouter-Title": "Silicon", "Content-Type": "application/json"}

    async def catalog(self) -> ComputeCatalog:
        if not self.enabled:
            return ComputeCatalog(enabled=False, models=[ModelInfo(id=key, name=policy.name, description=policy.description) for key, policy in MODELS.items()])
        async with self._catalog_lock:
            if monotonic() - self._catalog_at > 120:
                rows: dict[str, Any] = {}
                try:
                    result = await self.client.get(self.base_url + "/models/user", headers=self.headers, timeout=15)
                    if result.status_code == 200:
                        rows = {model["id"]: model for model in result.json().get("data", []) if model.get("id") in MODELS}
                except (httpx.HTTPError, ValueError, TypeError, KeyError):
                    pass
                self._catalog = []
                for model_id, policy in MODELS.items():
                    raw = rows.get(model_id, {})
                    price = raw.get("pricing") or {}
                    try:
                        input_price = Decimal(str(price["prompt"])) * 1_000_000
                        output_price = Decimal(str(price["completion"])) * 1_000_000
                        eligible = (input_price.is_finite() and output_price.is_finite()
                                    and 0 <= input_price <= policy.input_ceiling
                                    and 0 <= output_price <= policy.output_ceiling)
                    except (KeyError, ValueError, ArithmeticError):
                        input_price = output_price = None
                        eligible = False
                    self._catalog.append(ModelInfo(id=model_id, name=policy.name, description=policy.description, input_per_million=str(input_price) if input_price is not None else None, output_per_million=str(output_price) if output_price is not None else None, context_length=raw.get("context_length"), available=eligible, tools="tools" in raw.get("supported_parameters", [])))
                self._catalog_at = monotonic()
        return ComputeCatalog(enabled=True, models=self._catalog)

    async def prepare(self, body: dict[str, Any]) -> tuple[dict[str, Any], int]:
        if not self.enabled:
            raise HTTPException(503, "Compute is currently unavailable.")
        policy = MODELS.get(body.get("model"))
        if not policy:
            raise HTTPException(400, "Choose a model from Silicon's model list.")
        catalog = await self.catalog()
        if not any(model.id == body["model"] and model.available for model in catalog.models):
            raise HTTPException(503, "This model is temporarily unavailable. Choose another model.")
        size = len(json.dumps(body, ensure_ascii=False).encode())
        if size > 64000:
            raise HTTPException(413, "This conversation is too long. Start a new conversation.")
        # UTF-8 bytes upper-bound text tokens. Include substantial framing space,
        # tool definitions and provider wrappers; deny non-text/metered plugins.
        input_bound = size + 8192
        output_bound = int(body.get("max_tokens", 1024))
        reserve = atoms((policy.input_ceiling * input_bound + policy.output_ceiling * output_bound) / 1_000_000)
        prepared = {**body, "reasoning": {"enabled": False}, "provider": {"require_parameters": True, "data_collection": "deny", "sort": "price", "max_price": {"prompt": float(policy.input_ceiling), "completion": float(policy.output_ceiling), "request": 0, "image": 0}}}
        if body.get("stream"):
            prepared["stream_options"] = {"include_usage": True}
        return prepared, reserve

    async def complete(self, body: dict[str, Any]) -> httpx.Response:
        return await self.client.post(self.base_url + "/chat/completions", headers=self.headers, json=body)

    async def generation(self, generation_id: str) -> dict[str, Any] | None:
        try:
            response = await self.client.get(self.base_url + "/generation", params={"id": generation_id}, headers=self.headers, timeout=15)
            if response.status_code == 200:
                data = response.json().get("data")
                if isinstance(data, dict):
                    return data
        except (httpx.HTTPError, ValueError):
            pass
        return None

    async def close(self) -> None:
        await self.client.aclose()
