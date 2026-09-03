"""Focused tests for the bounded provider-document HTTP client."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import httpx
import pytest

from app.services.provider_document_client import HttpProviderDocumentClient
from app.tools.provider_docs import ProviderDocumentResponse

_ALLOWED_URL = "https://docs.example.com/models/exact-version"


class SingleChunkStream(httpx.AsyncByteStream):
    def __init__(self, content: bytes) -> None:
        self._content = content

    async def __aiter__(self) -> AsyncIterator[bytes]:
        yield self._content


def _run_get(
    handler: httpx.AsyncBaseTransport,
    *,
    url: str = _ALLOWED_URL,
    timeout_seconds: float = 10.0,
    max_response_bytes: int = 1_000_000,
) -> ProviderDocumentResponse:
    async def invoke() -> ProviderDocumentResponse:
        async with httpx.AsyncClient(transport=handler) as client:
            document_client = HttpProviderDocumentClient(
                client=client,
                allowed_urls=(_ALLOWED_URL,),
                timeout_seconds=timeout_seconds,
                max_response_bytes=max_response_bytes,
            )
            return await document_client.get(url)

    return asyncio.run(invoke())


def test_fetches_exact_allowlisted_text_without_following_redirects() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == _ALLOWED_URL
        assert request.headers["accept"].startswith("text/html")
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=utf-8"},
            content=b"<p>Exact model documentation</p>",
        )

    response = _run_get(httpx.MockTransport(handler))
    assert response.status_code == 200
    assert response.text == "<p>Exact model documentation</p>"
    assert response.redirect_url is None


def test_returns_resolved_redirect_without_following_it() -> None:
    calls: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(302, headers={"location": "/models/new-version"})

    response = _run_get(httpx.MockTransport(handler))
    assert calls == [_ALLOWED_URL]
    assert response.status_code == 302
    assert response.redirect_url == "https://docs.example.com/models/new-version"


def test_rejects_non_allowlisted_url_before_network_access() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("disallowed URL must not reach the transport")

    with pytest.raises(OSError, match="not allowlisted"):
        _run_get(httpx.MockTransport(handler), url="https://outside.example.net/document")


def test_maps_httpx_timeout_to_builtin_timeout_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("secret upstream detail", request=request)

    with pytest.raises(TimeoutError, match="request timed out") as exc_info:
        _run_get(httpx.MockTransport(handler))
    assert "secret upstream detail" not in str(exc_info.value)


def test_enforces_total_request_deadline() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.05)
        return httpx.Response(200, text="too late")

    with pytest.raises(TimeoutError, match="request timed out"):
        _run_get(httpx.MockTransport(handler), timeout_seconds=0.001)


def test_rejects_encoded_or_single_chunk_oversize_responses_before_buffering() -> None:
    async def encoded_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/plain", "content-encoding": "gzip"},
            stream=SingleChunkStream(b"encoded"),
        )

    async def oversized_handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["accept-encoding"] == "identity"
        return httpx.Response(
            200,
            headers={"content-type": "text/plain"},
            stream=SingleChunkStream(b"eleven-byte"),
        )

    with pytest.raises(OSError, match="encoding is not supported"):
        _run_get(httpx.MockTransport(encoded_handler), max_response_bytes=10)
    with pytest.raises(OSError, match="size limit"):
        _run_get(httpx.MockTransport(oversized_handler), max_response_bytes=10)


@pytest.mark.parametrize(
    ("headers", "content", "message"),
    [
        ({"content-type": "application/octet-stream"}, b"binary", "not text"),
        (
            {"content-type": "text/plain", "content-length": "11"},
            b"hello world",
            "size limit",
        ),
        ({"content-type": "text/plain; charset=utf-8"}, b"\xff", "could not be decoded"),
    ],
)
def test_rejects_unsafe_or_unusable_response_bodies(
    headers: dict[str, str],
    content: bytes,
    message: str,
) -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers=headers, content=content)

    with pytest.raises(OSError, match=message):
        _run_get(httpx.MockTransport(handler), max_response_bytes=10)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"allowed_urls": ()},
        {"allowed_urls": ("http://docs.example.com/model",)},
        {"allowed_urls": ("https://user@example.com/model",)},
        {"allowed_urls": (_ALLOWED_URL,), "timeout_seconds": 0},
        {"allowed_urls": (_ALLOWED_URL,), "timeout_seconds": float("nan")},
        {"allowed_urls": (_ALLOWED_URL,), "timeout_seconds": float("inf")},
        {"allowed_urls": (_ALLOWED_URL,), "max_response_bytes": 0},
    ],
)
def test_constructor_rejects_unbounded_or_unsafe_configuration(kwargs: dict[str, object]) -> None:
    async def invoke() -> None:
        async with httpx.AsyncClient() as client:
            HttpProviderDocumentClient(client=client, **kwargs)  # type: ignore[arg-type]

    with pytest.raises(ValueError):
        asyncio.run(invoke())
