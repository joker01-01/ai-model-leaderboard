"""OpenAI Responses API implementation of the model-intent boundary."""

from __future__ import annotations

import asyncio
from math import isfinite
from typing import TypeAlias, cast
from urllib.parse import urlsplit

import httpx
from pydantic import ValidationError

from app.domain.models import AgentRequest
from app.services.model_gateway import ModelGatewayError, ParsedAgentRequest

JsonValue: TypeAlias = (  # noqa: UP040 - mypy stable lacks PEP 695 type alias support
    None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
)
JsonObject: TypeAlias = dict[str, JsonValue]  # noqa: UP040 - mypy stable lacks PEP 695 type alias support

_INSTRUCTIONS = """Extract only the user's requested ModelOps intent and user-supplied constraints.
Use recommend for model selection, explain_unranked for an exact model-reference explanation, and
prepare_update only when the user explicitly supplies a proposed evidence update. Do not rank models,
approve fuzzy model matches, invent evidence, or infer missing facts. Put only user-fillable required
fields that are absent in missingConstraints. Return every schema field: use null for unspecified
nullable values, an empty array when appropriate, `any` for an unspecified licensePolicy, and false
for an unspecified openWeightsRequired.
"""


def _require_all_object_fields(value: JsonValue) -> JsonValue:
    """Adapt Pydantic's defaults to the strict Structured Outputs schema contract."""

    if isinstance(value, list):
        return [_require_all_object_fields(item) for item in value]
    if not isinstance(value, dict):
        return value

    adapted = {
        key: _require_all_object_fields(child)
        for key, child in value.items()
        if key != "default"
    }
    properties = adapted.get("properties")
    if isinstance(properties, dict):
        adapted["required"] = list(properties)
        adapted["additionalProperties"] = False
    return adapted


def _parsed_request_schema() -> JsonObject:
    raw_schema = cast(JsonObject, ParsedAgentRequest.model_json_schema(by_alias=True))
    schema = _require_all_object_fields(raw_schema)
    if not isinstance(schema, dict):  # pragma: no cover - Pydantic root schemas are objects
        raise RuntimeError("ParsedAgentRequest did not produce an object schema")
    return schema


_PARSED_REQUEST_SCHEMA = _parsed_request_schema()


def _responses_endpoint(base_url: str) -> str:
    if base_url.strip() != base_url:
        raise ValueError("base_url must not contain surrounding whitespace")
    try:
        parsed = urlsplit(base_url)
        port = parsed.port
    except ValueError:
        raise ValueError("base_url must be a valid absolute HTTPS URL") from None
    if (
        parsed.scheme != "https"
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("base_url must be an absolute HTTPS URL without credentials, query, or fragment")

    host = parsed.hostname
    if ":" in host:
        host = f"[{host}]"
    authority = host if port is None else f"{host}:{port}"
    path = parsed.path.rstrip("/")
    endpoint_path = f"{path}/responses" if path.endswith("/v1") else f"{path}/v1/responses"
    return f"https://{authority}{endpoint_path}"


def _output_text(payload: object) -> str:
    if not isinstance(payload, dict):
        raise ModelGatewayError("model gateway returned an invalid response")

    status = payload.get("status")
    if status is not None and status != "completed":
        raise ModelGatewayError("model gateway response was not completed")

    output = payload.get("output")
    if not isinstance(output, list):
        raise ModelGatewayError("model gateway response contained no output text")

    text_parts: list[str] = []
    refused = False
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            part_type = part.get("type")
            if part_type == "refusal":
                refused = True
            elif part_type == "output_text":
                text = part.get("text")
                if isinstance(text, str) and text:
                    text_parts.append(text)

    if refused:
        raise ModelGatewayError("model refused to produce a structured request")
    if not text_parts:
        raise ModelGatewayError("model gateway response contained no output text")
    return "".join(text_parts)


class OpenAIResponsesGateway:
    """Extract a strict ``ParsedAgentRequest`` through OpenAI's Responses API."""

    def __init__(
        self,
        *,
        client: httpx.AsyncClient,
        api_key: str,
        model: str,
        base_url: str,
        timeout_seconds: float = 30.0,
    ) -> None:
        if not api_key or api_key.strip() != api_key:
            raise ValueError("api_key must be a non-empty value without surrounding whitespace")
        if not model or model.strip() != model:
            raise ValueError("model must be a non-empty value without surrounding whitespace")
        if not isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be a positive finite number")

        self._client = client
        self._api_key = api_key
        self._model = model
        self._endpoint = _responses_endpoint(base_url)
        self._timeout_seconds = timeout_seconds

    async def parse_request(self, request: AgentRequest) -> ParsedAgentRequest:
        body: dict[str, object] = {
            "model": self._model,
            "instructions": _INSTRUCTIONS,
            "input": request.message,
            "store": False,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "parsed_agent_request",
                    "strict": True,
                    "schema": _PARSED_REQUEST_SCHEMA,
                }
            },
        }
        try:
            async with asyncio.timeout(self._timeout_seconds):
                response = await self._client.post(
                    self._endpoint,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                    timeout=self._timeout_seconds,
                    follow_redirects=False,
                )
                response.raise_for_status()
        except (TimeoutError, httpx.TimeoutException):
            raise ModelGatewayError("model gateway timed out") from None
        except httpx.HTTPStatusError as exc:
            raise ModelGatewayError(f"model gateway returned HTTP status {exc.response.status_code}") from None
        except httpx.RequestError:
            raise ModelGatewayError("model gateway is unavailable") from None

        try:
            payload: object = response.json()
        except ValueError:
            raise ModelGatewayError("model gateway returned an invalid response") from None

        output_text = _output_text(payload)
        try:
            return ParsedAgentRequest.model_validate_json(output_text, strict=True)
        except ValidationError:
            raise ModelGatewayError("model gateway returned invalid structured output") from None
