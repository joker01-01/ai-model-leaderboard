"""Environment-backed settings for the independently deployed Agent API."""

from __future__ import annotations

import os
from collections.abc import Mapping
from ipaddress import ip_network
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field, SecretStr

from app.domain.models import AbsoluteHttpsUrl, NonEmptyString, StrictModel


def _validate_origin(value: str) -> str:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("CORS origin must be a valid HTTP(S) origin") from exc
    if parsed.scheme not in {"http", "https"} or parsed.hostname is None:
        raise ValueError("CORS origin must be a valid HTTP(S) origin")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("CORS origin credentials are not allowed")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("CORS origin cannot contain a path, query, or fragment")
    host = parsed.hostname.lower()
    display_host = f"[{host}]" if ":" in host else host
    default_port = (parsed.scheme == "http" and port in {None, 80}) or (
        parsed.scheme == "https" and port in {None, 443}
    )
    authority = display_host if default_port else f"{display_host}:{port}"
    return f"{parsed.scheme}://{authority}"


CorsOrigin = Annotated[str, AfterValidator(_validate_origin)]


def _validate_proxy_cidr(value: str) -> str:
    if not value or value.strip() != value:
        raise ValueError("trusted proxy CIDR must be a non-empty value without surrounding whitespace")
    try:
        return str(ip_network(value, strict=False))
    except ValueError as exc:
        raise ValueError("trusted proxy CIDR must be a valid IPv4 or IPv6 network") from exc


TrustedProxyCidr = Annotated[str, AfterValidator(_validate_proxy_cidr)]


class ApiSettings(StrictModel):
    """Validated settings; secrets remain wrapped and never enter API payloads."""

    cors_origins: tuple[CorsOrigin, ...] = (
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "https://joker01-01.github.io",
    )
    model_api_key: SecretStr | None = None
    model_name: NonEmptyString = "deepseek-v4-flash"
    model_base_url: AbsoluteHttpsUrl = "https://api.deepseek.com"
    model_timeout_seconds: Annotated[float, Field(gt=0, le=120)] = 30.0
    model_max_response_bytes: Annotated[int, Field(ge=1_024, le=5_000_000)] = 1_000_000
    provider_document_timeout_seconds: Annotated[float, Field(gt=0, le=30)] = 10.0
    provider_document_max_bytes: Annotated[int, Field(ge=1_024, le=5_000_000)] = 1_000_000
    sse_heartbeat_seconds: Annotated[float, Field(gt=0, le=60)] = 15.0
    graph_recursion_limit: Annotated[int, Field(ge=8, le=128)] = 32
    trusted_proxy_cidrs: tuple[TrustedProxyCidr, ...] = ()

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> ApiSettings:
        values = os.environ if environ is None else environ
        data: dict[str, object] = {}
        cors = values.get("MODELOPS_CORS_ORIGINS")
        if cors is not None:
            data["cors_origins"] = tuple(item.strip() for item in cors.split(",") if item.strip())
        trusted_proxies = values.get("MODELOPS_TRUSTED_PROXY_CIDRS")
        if trusted_proxies is not None:
            data["trusted_proxy_cidrs"] = tuple(
                item.strip() for item in trusted_proxies.split(",") if item.strip()
            )
        string_fields = {
            "MODELOPS_MODEL_API_KEY": "model_api_key",
            "MODELOPS_MODEL_NAME": "model_name",
            "MODELOPS_MODEL_BASE_URL": "model_base_url",
        }
        for variable, field_name in string_fields.items():
            if variable in values:
                data[field_name] = values[variable]
        numeric_fields: dict[str, tuple[str, type[float] | type[int]]] = {
            "MODELOPS_MODEL_TIMEOUT_SECONDS": ("model_timeout_seconds", float),
            "MODELOPS_MODEL_MAX_RESPONSE_BYTES": ("model_max_response_bytes", int),
            "MODELOPS_PROVIDER_DOCUMENT_TIMEOUT_SECONDS": ("provider_document_timeout_seconds", float),
            "MODELOPS_PROVIDER_DOCUMENT_MAX_BYTES": ("provider_document_max_bytes", int),
            "MODELOPS_SSE_HEARTBEAT_SECONDS": ("sse_heartbeat_seconds", float),
            "MODELOPS_GRAPH_RECURSION_LIMIT": ("graph_recursion_limit", int),
        }
        for variable, (field_name, parser) in numeric_fields.items():
            if variable in values:
                data[field_name] = parser(values[variable])
        return cls.model_validate(data)
