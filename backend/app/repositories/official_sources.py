"""Reviewed creator-to-official-source registry and citation binding."""

from __future__ import annotations

import ipaddress
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import unquote, urlsplit

from pydantic import AfterValidator, Field, StringConstraints, ValidationError, field_validator, model_validator

from app.domain.advisor import OfficialSourceKind
from app.domain.errors import RepositoryDataError
from app.domain.models import NonEmptyString, StrictModel

_HOST_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_GITHUB_ORGANIZATION_PATH = re.compile(r"^/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/$")


def _validate_registry_host(value: str) -> str:
    if value.strip() != value or not value:
        raise ValueError("registry host must be non-empty without surrounding whitespace")
    try:
        value.encode("ascii")
    except UnicodeEncodeError as exc:
        raise ValueError("registry host must contain ASCII characters only") from exc
    if value != value.lower() or value.endswith(".") or len(value) > 253:
        raise ValueError("registry host must be canonical lowercase ASCII")
    try:
        ipaddress.ip_address(value)
    except ValueError:
        pass
    else:
        raise ValueError("registry host must be a DNS name, not an IP address")
    if any(not _HOST_LABEL.fullmatch(label) for label in value.split(".")):
        raise ValueError("registry host must be a valid DNS name")
    return value


def _validate_path_prefix(value: str) -> str:
    if value.strip() != value or not value.startswith("/") or not value.endswith("/"):
        raise ValueError("pathPrefix must be a canonical absolute directory prefix")
    if "\\" in value or "?" in value or "#" in value or "%" in value or "//" in value:
        raise ValueError("pathPrefix contains an ambiguous path component")
    if any(segment in {".", ".."} for segment in value.split("/")):
        raise ValueError("pathPrefix must not contain dot segments")
    return value


RegistryHost = Annotated[
    str,
    StringConstraints(min_length=1, max_length=253),
    AfterValidator(_validate_registry_host),
]
RegistryPathPrefix = Annotated[
    str,
    StringConstraints(min_length=1, max_length=256),
    AfterValidator(_validate_path_prefix),
]


class OfficialSourceRule(StrictModel):
    kind: OfficialSourceKind
    host: RegistryHost
    allow_subdomains: bool
    path_prefix: RegistryPathPrefix

    @model_validator(mode="after")
    def validate_kind_specific_scope(self) -> OfficialSourceRule:
        if self.kind == OfficialSourceKind.OFFICIAL_GITHUB:
            if self.host != "github.com" or self.allow_subdomains:
                raise ValueError("official GitHub sources must bind exact github.com")
            if not _GITHUB_ORGANIZATION_PATH.fullmatch(self.path_prefix):
                raise ValueError("official GitHub pathPrefix must identify exactly one organization")
        elif self.host == "github.com":
            raise ValueError("github.com sources must use official_github organization scoping")
        return self

class ArtificialAnalysisSourceRule(StrictModel):
    host: RegistryHost
    allow_subdomains: bool
    path_prefix: RegistryPathPrefix


class OfficialCreatorSources(StrictModel):
    creator_id: NonEmptyString
    sources: Annotated[tuple[OfficialSourceRule, ...], Field(min_length=1)]

    @field_validator("sources")
    @classmethod
    def validate_unique_sources(
        cls,
        value: tuple[OfficialSourceRule, ...],
    ) -> tuple[OfficialSourceRule, ...]:
        identities = tuple(
            (source.kind, source.host, source.allow_subdomains, source.path_prefix)
            for source in value
        )
        if len(identities) != len(set(identities)):
            raise ValueError("creator sources must not contain duplicates")
        if any(source.kind == OfficialSourceKind.ARTIFICIAL_ANALYSIS for source in value):
            raise ValueError("Artificial Analysis rules belong in artificialAnalysis")
        return value


class OfficialSourcesRegistry(StrictModel):
    schema_version: Literal[1]
    artificial_analysis: Annotated[tuple[ArtificialAnalysisSourceRule, ...], Field(min_length=1)]
    creators: tuple[OfficialCreatorSources, ...]

    @model_validator(mode="after")
    def validate_unique_bindings(self) -> OfficialSourcesRegistry:
        creator_ids = tuple(creator.creator_id for creator in self.creators)
        if len(creator_ids) != len(set(creator_ids)):
            raise ValueError("creators must use unique creatorId values")
        aa_rules = tuple(
            (source.host, source.allow_subdomains, source.path_prefix)
            for source in self.artificial_analysis
        )
        if len(aa_rules) != len(set(aa_rules)):
            raise ValueError("artificialAnalysis must not contain duplicate sources")
        return self

@dataclass(frozen=True, slots=True)
class OfficialSourceMatch:
    url: str
    source_kind: OfficialSourceKind
    host: str
    path_prefix: str
    creator_id: str | None


@dataclass(frozen=True, slots=True)
class _CitationUrl:
    raw: str
    host: str
    path: str


def _parse_citation_url(value: str) -> _CitationUrl | None:
    if not value or len(value) > 2_048 or value.strip() != value:
        return None
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return None
    if (
        parsed.scheme != "https"
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 443}
        or parsed.fragment
    ):
        return None
    if parsed.hostname.endswith("."):
        return None
    try:
        host = parsed.hostname.encode("idna").decode("ascii").lower()
        path = unquote(parsed.path or "/", errors="strict")
    except (UnicodeError, ValueError):
        return None
    if "\\" in path or any(ord(character) < 32 for character in path):
        return None
    if any(segment in {".", ".."} for segment in path.split("/")):
        return None
    return _CitationUrl(raw=value, host=host, path=path)


def _host_matches(host: str, rule_host: str, allow_subdomains: bool) -> bool:
    return host == rule_host or (allow_subdomains and host.endswith(f".{rule_host}"))


def _path_matches(path: str, prefix: str, *, github: bool) -> bool:
    if prefix == "/":
        return path.startswith("/")
    if github:
        expected_organization = prefix.strip("/").lower()
        path_segments = tuple(segment for segment in path.split("/") if segment)
        return bool(path_segments) and path_segments[0].lower() == expected_organization
    return path == prefix[:-1] or path.startswith(prefix)


class OfficialSourcesRepository:
    """Matches provider-returned citations against reviewed source bindings."""

    def __init__(self, registry: OfficialSourcesRegistry) -> None:
        self._registry = registry
        self._creators = {creator.creator_id: creator.sources for creator in registry.creators}

    @classmethod
    def load(cls, path: str | Path | None = None) -> OfficialSourcesRepository:
        repository_root = Path(__file__).resolve().parents[3]
        resolved_path = Path(path) if path is not None else repository_root / "data" / "aa" / "official-sources.json"
        try:
            registry = OfficialSourcesRegistry.model_validate_json(
                resolved_path.read_text(encoding="utf-8"),
                strict=True,
                by_alias=True,
                by_name=False,
            )
        except (OSError, ValidationError, ValueError) as exc:
            raise RepositoryDataError(f"failed to load official-source registry {resolved_path}: {exc}") from exc
        return cls(registry)

    @property
    def registry(self) -> OfficialSourcesRegistry:
        return self._registry

    @property
    def creator_ids(self) -> tuple[str, ...]:
        return tuple(self._creators)

    def sources_for(self, creator_id: str) -> tuple[OfficialSourceRule, ...]:
        return self._creators.get(creator_id, ())

    def unknown_creator_ids(self, known_creator_ids: Iterable[str]) -> tuple[str, ...]:
        return tuple(sorted(set(self._creators).difference(known_creator_ids)))

    @staticmethod
    def is_well_formed_citation_url(url: str) -> bool:
        """Return whether a URL passes the registry's canonical HTTPS boundary."""

        return _parse_citation_url(url) is not None

    @staticmethod
    def _match_creator_rule(
        citation: _CitationUrl,
        creator_id: str,
        rules: tuple[OfficialSourceRule, ...],
    ) -> OfficialSourceMatch | None:
        for rule in rules:
            if not _host_matches(citation.host, rule.host, rule.allow_subdomains):
                continue
            is_github = rule.kind == OfficialSourceKind.OFFICIAL_GITHUB
            if not _path_matches(citation.path, rule.path_prefix, github=is_github):
                continue
            return OfficialSourceMatch(
                url=citation.raw,
                source_kind=rule.kind,
                host=citation.host,
                path_prefix=rule.path_prefix,
                creator_id=creator_id,
            )
        return None

    def validate_citation_url(
        self,
        creator_id: str,
        url: str,
        redirect_chain: Sequence[str] = (),
    ) -> OfficialSourceMatch | None:
        rules = self.sources_for(creator_id)
        if not rules or isinstance(redirect_chain, str):
            return None
        final_match: OfficialSourceMatch | None = None
        for hop in (*redirect_chain, url):
            citation = _parse_citation_url(hop)
            if citation is None:
                return None
            final_match = self._match_creator_rule(citation, creator_id, rules)
            if final_match is None:
                return None
        return final_match

    def validate_aa_citation_url(
        self,
        url: str,
        redirect_chain: Sequence[str] = (),
    ) -> OfficialSourceMatch | None:
        if isinstance(redirect_chain, str):
            return None
        final_match: OfficialSourceMatch | None = None
        for hop in (*redirect_chain, url):
            citation = _parse_citation_url(hop)
            if citation is None:
                return None
            final_match = None
            for rule in self._registry.artificial_analysis:
                if _host_matches(citation.host, rule.host, rule.allow_subdomains) and _path_matches(
                    citation.path,
                    rule.path_prefix,
                    github=False,
                ):
                    final_match = OfficialSourceMatch(
                        url=citation.raw,
                        source_kind=OfficialSourceKind.ARTIFICIAL_ANALYSIS,
                        host=citation.host,
                        path_prefix=rule.path_prefix,
                        creator_id=None,
                    )
                    break
            if final_match is None:
                return None
        return final_match
