"""Bounded HTTP client for repository-owned provider-document URLs."""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from math import isfinite
from urllib.parse import urljoin, urlsplit

import httpx

from app.tools.provider_docs import ProviderDocumentResponse

_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
_TEXT_MEDIA_TYPES = frozenset({"text/html", "text/plain", "application/xhtml+xml"})


class HttpProviderDocumentClient:
    """Fetch one exact allowlisted URL without following redirects automatically."""

    def __init__(
        self,
        *,
        client: httpx.AsyncClient,
        allowed_urls: Iterable[str],
        timeout_seconds: float = 10.0,
        max_response_bytes: int = 1_000_000,
    ) -> None:
        urls = frozenset(allowed_urls)
        if not urls:
            raise ValueError("at least one provider-document URL must be allowlisted")
        if not isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be a positive finite number")
        if max_response_bytes <= 0:
            raise ValueError("max_response_bytes must be positive")
        for url in urls:
            self._validate_https_url(url)

        self._client = client
        self._allowed_urls = urls
        self._timeout_seconds = timeout_seconds
        self._timeout = httpx.Timeout(timeout_seconds)
        self._max_response_bytes = max_response_bytes

    @staticmethod
    def _validate_https_url(url: str) -> None:
        try:
            parsed = urlsplit(url)
            port = parsed.port
        except ValueError as exc:
            raise ValueError("provider-document URL must be valid absolute HTTPS") from exc
        if parsed.scheme != "https" or parsed.hostname is None:
            raise ValueError("provider-document URL must be valid absolute HTTPS")
        if parsed.username is not None or parsed.password is not None or port is not None:
            raise ValueError("provider-document URL credentials and explicit ports are not allowed")

    @staticmethod
    def _redirect_url(url: str, response: httpx.Response) -> str | None:
        if response.status_code not in _REDIRECT_STATUSES:
            return None
        location = response.headers.get("location")
        if not isinstance(location, str):
            return None
        return urljoin(url, location)

    async def get(self, url: str) -> ProviderDocumentResponse:
        if url not in self._allowed_urls:
            raise OSError("provider-document URL is not allowlisted")

        try:
            async with asyncio.timeout(self._timeout_seconds):
                async with self._client.stream(
                    "GET",
                    url,
                    follow_redirects=False,
                    timeout=self._timeout,
                    headers={
                        "Accept": "text/html, text/plain;q=0.9, application/xhtml+xml;q=0.8",
                        "Accept-Encoding": "identity",
                    },
                ) as response:
                    redirect_url = self._redirect_url(url, response)
                    if redirect_url is not None:
                        return ProviderDocumentResponse(
                            status_code=response.status_code,
                            redirect_url=redirect_url,
                        )
                    if response.status_code != 200:
                        return ProviderDocumentResponse(status_code=response.status_code)

                    media_type = response.headers.get("content-type", "").partition(";")[0].strip().lower()
                    if media_type and media_type not in _TEXT_MEDIA_TYPES:
                        raise OSError("provider-document response is not text")
                    content_encoding = response.headers.get("content-encoding", "identity").strip().lower()
                    if content_encoding not in {"", "identity"}:
                        raise OSError("provider-document response encoding is not supported")

                    content_length = response.headers.get("content-length")
                    if content_length is not None:
                        try:
                            declared_length = int(content_length)
                        except ValueError as exc:
                            raise OSError("provider-document response has an invalid content length") from exc
                        if declared_length < 0 or declared_length > self._max_response_bytes:
                            raise OSError("provider-document response exceeds the size limit")

                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(chunk) > self._max_response_bytes - len(body):
                            raise OSError("provider-document response exceeds the size limit")
                        body.extend(chunk)

                    encoding = response.encoding or "utf-8"
                    try:
                        text = bytes(body).decode(encoding)
                    except (LookupError, UnicodeDecodeError) as exc:
                        raise OSError("provider-document response could not be decoded") from exc
                    return ProviderDocumentResponse(status_code=200, text=text)
        except (TimeoutError, httpx.TimeoutException):
            raise TimeoutError("provider-document request timed out") from None
        except httpx.RequestError as exc:
            raise OSError("provider-document request failed") from exc
