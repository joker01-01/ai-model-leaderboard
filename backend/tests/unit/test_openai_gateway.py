"""Offline contract tests for the OpenAI Responses API model gateway."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable

import httpx
import pytest

from app.domain.models import AgentIntent, AgentRequest, ModelTask
from app.services.model_gateway import ModelGatewayError, ParsedAgentRequest
from app.services.openai_gateway import OpenAIResponsesGateway

Handler = Callable[[httpx.Request], httpx.Response]

_API_KEY = "test-secret-api-key"
_USER_INPUT = "Recommend a Python coding model. PRIVATE_INPUT_MARKER"


def _structured_output(**overrides: object) -> dict[str, object]:
    output: dict[str, object] = {
        "intent": "recommend",
        "constraints": {
            "task": "python_coding",
            "monthlyBudget": None,
            "currency": None,
            "providerRegionId": None,
            "endUserCountry": None,
            "maxLatencyMs": None,
            "licensePolicy": "any",
            "openWeightsRequired": False,
            "inputTokens": None,
            "cachedInputTokens": None,
            "outputTokens": None,
            "monthlyRequestCount": None,
            "asOf": None,
        },
        "modelReference": None,
        "updateInput": None,
        "missingConstraints": [],
    }
    output.update(overrides)
    return output


def _response_with_output(output: object, *, status: str = "completed") -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "status": status,
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": json.dumps(output)}],
                }
            ],
        },
    )


def _parse_with(handler: Handler) -> ParsedAgentRequest:
    async def run() -> ParsedAgentRequest:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            gateway = OpenAIResponsesGateway(
                client=client,
                api_key=_API_KEY,
                model="test-structured-model",
                base_url="https://gateway.example/v1/",
                timeout_seconds=2.0,
            )
            return await gateway.parse_request(AgentRequest(message=_USER_INPUT))

    return asyncio.run(run())


def _has_default(value: object) -> bool:
    if isinstance(value, dict):
        return "default" in value or any(_has_default(child) for child in value.values())
    if isinstance(value, list):
        return any(_has_default(child) for child in value)
    return False


def test_gateway_posts_stateless_strict_schema_request_and_parses_output() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return _response_with_output(_structured_output())

    parsed = _parse_with(handler)

    assert parsed.intent == AgentIntent.RECOMMEND
    assert parsed.constraints.task == ModelTask.PYTHON_CODING
    request = captured["request"]
    assert isinstance(request, httpx.Request)
    assert request.method == "POST"
    assert request.url == httpx.URL("https://gateway.example/v1/responses")
    assert request.headers["authorization"] == f"Bearer {_API_KEY}"

    body = json.loads(request.content)
    assert body["model"] == "test-structured-model"
    assert body["input"] == _USER_INPUT
    assert body["store"] is False
    response_format = body["text"]["format"]
    assert response_format["type"] == "json_schema"
    assert response_format["name"] == "parsed_agent_request"
    assert response_format["strict"] is True

    schema = response_format["schema"]
    assert schema["required"] == list(schema["properties"])
    constraints_schema = schema["$defs"]["SelectionConstraints"]
    assert constraints_schema["required"] == list(constraints_schema["properties"])
    assert schema["additionalProperties"] is False
    assert constraints_schema["additionalProperties"] is False
    assert not _has_default(schema)


@pytest.mark.parametrize(
    ("handler", "expected_message"),
    [
        (
            lambda request: (_ for _ in ()).throw(httpx.ReadTimeout("upstream details", request=request)),
            "model gateway timed out",
        ),
        (
            lambda request: httpx.Response(
                401,
                request=request,
                text=f"invalid {_API_KEY}: {_USER_INPUT}",
            ),
            "model gateway returned HTTP status 401",
        ),
        (
            lambda request: httpx.Response(200, request=request, content=b"not-json"),
            "model gateway returned an invalid response",
        ),
        (
            lambda request: httpx.Response(200, request=request, json={"status": "completed", "output": []}),
            "model gateway response contained no output text",
        ),
        (
            lambda request: httpx.Response(
                200,
                request=request,
                json={
                    "status": "completed",
                    "output": [
                        {
                            "type": "message",
                            "content": [{"type": "refusal", "refusal": f"no {_USER_INPUT}"}],
                        }
                    ],
                },
            ),
            "model refused to produce a structured request",
        ),
        (
            lambda request: httpx.Response(
                200,
                request=request,
                json={
                    "status": "completed",
                    "output": [
                        {"type": "message", "content": [{"type": "output_text", "text": "not-json"}]}
                    ],
                },
            ),
            "model gateway returned invalid structured output",
        ),
        (
            lambda request: _response_with_output(_structured_output(unexpected="rejected")),
            "model gateway returned invalid structured output",
        ),
        (
            lambda request: _response_with_output(_structured_output(), status="incomplete"),
            "model gateway response was not completed",
        ),
    ],
)
def test_gateway_maps_remote_and_output_failures_without_leaking_sensitive_values(
    handler: Handler,
    expected_message: str,
) -> None:
    with pytest.raises(ModelGatewayError) as caught:
        _parse_with(handler)

    message = str(caught.value)
    assert message == expected_message
    assert _API_KEY not in message
    assert _USER_INPUT not in message


def test_gateway_maps_transport_error_without_leaking_sensitive_values() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"cannot send {_API_KEY}: {_USER_INPUT}", request=request)

    with pytest.raises(ModelGatewayError, match="^model gateway is unavailable$") as caught:
        _parse_with(handler)

    assert _API_KEY not in str(caught.value)
    assert _USER_INPUT not in str(caught.value)


def test_gateway_enforces_total_request_deadline() -> None:
    async def run() -> None:
        async def handler(_request: httpx.Request) -> httpx.Response:
            await asyncio.Event().wait()
            raise AssertionError("the total request deadline must cancel the transport")

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            gateway = OpenAIResponsesGateway(
                client=client,
                api_key=_API_KEY,
                model="test-structured-model",
                base_url="https://gateway.example/v1",
                timeout_seconds=0.01,
            )
            with pytest.raises(ModelGatewayError, match="^model gateway timed out$") as caught:
                await gateway.parse_request(AgentRequest(message=_USER_INPUT))
            assert _API_KEY not in str(caught.value)
            assert _USER_INPUT not in str(caught.value)

    asyncio.run(run())


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"api_key": ""}, "api_key"),
        ({"model": ""}, "model"),
        ({"base_url": "http://gateway.example"}, "base_url"),
        ({"timeout_seconds": 0.0}, "timeout_seconds"),
    ],
)
def test_gateway_rejects_invalid_configuration(kwargs: dict[str, object], message: str) -> None:
    defaults: dict[str, object] = {
        "client": httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200))),
        "api_key": _API_KEY,
        "model": "test-structured-model",
        "base_url": "https://gateway.example",
        "timeout_seconds": 2.0,
    }
    defaults.update(kwargs)
    client = defaults["client"]
    assert isinstance(client, httpx.AsyncClient)
    try:
        with pytest.raises(ValueError, match=message):
            OpenAIResponsesGateway(**defaults)  # type: ignore[arg-type]
    finally:
        asyncio.run(client.aclose())
