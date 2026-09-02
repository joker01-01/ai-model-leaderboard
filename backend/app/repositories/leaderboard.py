"""Immutable, exact-match repository over the generated ModelOps snapshots."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta
from pathlib import Path
from typing import Never
from urllib.parse import urlsplit

from pydantic import ValidationError

from app.domain.errors import RepositoryDataError, RepositoryLookupError
from app.domain.models import (
    ArenaDimension,
    ArenaObservation,
    BenchmarkDefinition,
    BenchmarkId,
    BenchmarkObservation,
    CatalogModel,
    CatalogSnapshot,
    CurrencyCode,
    EvidenceSnapshot,
    ExactModelResolution,
    ExactResolutionStatus,
    ModelAliases,
    PricingTier,
    ProviderId,
    ProviderSource,
    ProviderSourceKind,
    RegionId,
)

PRICE_FRESHNESS_DAYS = 30

_PROVIDER_SOURCE_HOSTS: dict[ProviderId, frozenset[str]] = {
    ProviderId.ALIBABA_CLOUD_MODEL_STUDIO: frozenset({"help.aliyun.com", "www.alibabacloud.com"}),
    ProviderId.ANTHROPIC: frozenset({"platform.claude.com", "www.anthropic.com"}),
    ProviderId.DEEPSEEK: frozenset({"api-docs.deepseek.com", "huggingface.co"}),
    ProviderId.OPENAI: frozenset({"developers.openai.com"}),
    ProviderId.QWEN: frozenset({"huggingface.co"}),
}

_AA_BENCHMARK_IDS = frozenset({BenchmarkId.AA_CODING, BenchmarkId.AA_INTELLIGENCE})


def _fail(message: str) -> Never:
    raise RepositoryDataError(message)


def _assert_clean_text(value: str, path: str) -> None:
    if not value or value.strip() != value:
        _fail(f"{path}: expected a non-empty value without surrounding whitespace")


def _validated_https_host(url: str, path: str) -> str:
    _assert_clean_text(url, path)
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise RepositoryDataError(f"{path}: invalid URL") from exc
    if parsed.scheme != "https" or parsed.hostname is None:
        _fail(f"{path}: only absolute HTTPS URLs are allowed")
    if parsed.username is not None or parsed.password is not None:
        _fail(f"{path}: URL credentials are not allowed")
    if port is not None:
        _fail(f"{path}: explicit URL ports are not allowed")
    return parsed.hostname.lower()


def pricing_evidence_cutoff(tier: PricingTier) -> date:
    """Return the inclusive evidence cutoff for a pricing tier."""

    if tier.valid_through is not None and tier.valid_through < tier.stale_after:
        return tier.valid_through
    return tier.stale_after


class LeaderboardRepository:
    """Validated read-only view of the two committed generated JSON files."""

    def __init__(self, catalog: CatalogSnapshot, evidence: EvidenceSnapshot) -> None:
        self._catalog = catalog
        self._evidence = evidence
        self._validate_and_index()

    @classmethod
    def load(
        cls,
        catalog_path: str | Path | None = None,
        evidence_path: str | Path | None = None,
    ) -> LeaderboardRepository:
        repository_root = Path(__file__).resolve().parents[3]
        generated_dir = repository_root / "data" / "modelops" / "generated"
        resolved_catalog = Path(catalog_path) if catalog_path is not None else generated_dir / "catalog.json"
        resolved_evidence = Path(evidence_path) if evidence_path is not None else generated_dir / "evidence.json"
        try:
            catalog = CatalogSnapshot.model_validate_json(resolved_catalog.read_text(encoding="utf-8"))
        except (OSError, ValidationError, ValueError) as exc:
            raise RepositoryDataError(f"failed to load catalog snapshot {resolved_catalog}: {exc}") from exc
        try:
            evidence = EvidenceSnapshot.model_validate_json(resolved_evidence.read_text(encoding="utf-8"))
        except (OSError, ValidationError, ValueError) as exc:
            raise RepositoryDataError(f"failed to load evidence snapshot {resolved_evidence}: {exc}") from exc
        return cls(catalog, evidence)

    @property
    def catalog(self) -> CatalogSnapshot:
        return self._catalog

    @property
    def evidence(self) -> EvidenceSnapshot:
        return self._evidence

    @property
    def model_ids(self) -> tuple[str, ...]:
        return tuple(self._models_by_id)

    def get_model(self, model_id: str) -> CatalogModel | None:
        return self._models_by_id.get(model_id)

    def require_model(self, model_id: str) -> CatalogModel:
        model = self.get_model(model_id)
        if model is None:
            raise RepositoryLookupError(f"unknown exact model ID: {model_id}")
        return model

    def list_models(self, candidate_model_ids: Iterable[str] | None = None) -> tuple[CatalogModel, ...]:
        if candidate_model_ids is None:
            return tuple(self._models_by_id.values())
        requested = tuple(candidate_model_ids)
        unknown = sorted(set(requested).difference(self._models_by_id))
        if unknown:
            raise RepositoryLookupError(f"unknown exact model IDs: {', '.join(unknown)}")
        return tuple(self._models_by_id[model_id] for model_id in sorted(set(requested)))

    def get_aliases(self, model_id: str) -> ModelAliases:
        return self.require_model(model_id).aliases

    def get_benchmark_definitions(
        self,
        benchmark_ids: Iterable[BenchmarkId] | None = None,
    ) -> tuple[BenchmarkDefinition, ...]:
        if benchmark_ids is None:
            return tuple(self._benchmark_definitions.values())
        requested = set(benchmark_ids)
        return tuple(
            definition
            for benchmark_id, definition in self._benchmark_definitions.items()
            if benchmark_id in requested
        )

    def get_benchmark_observations(
        self,
        model_id: str,
        benchmark_ids: Iterable[BenchmarkId] | None = None,
    ) -> tuple[BenchmarkObservation, ...]:
        self.require_model(model_id)
        observations = self._benchmark_observations_by_model.get(model_id, ())
        if benchmark_ids is None:
            return observations
        requested = set(benchmark_ids)
        return tuple(observation for observation in observations if observation.benchmark_id in requested)

    def get_arena_observations(
        self,
        model_id: str,
        dimensions: Iterable[ArenaDimension] | None = None,
    ) -> tuple[ArenaObservation, ...]:
        self.require_model(model_id)
        observations = self._arena_observations_by_model.get(model_id, ())
        if dimensions is None:
            return observations
        requested = set(dimensions)
        return tuple(observation for observation in observations if observation.dimension in requested)

    def get_pricing_tiers(
        self,
        model_id: str,
        region_id: RegionId | None = None,
        currency: CurrencyCode | None = None,
        provider_id: ProviderId | None = None,
    ) -> tuple[PricingTier, ...]:
        self.require_model(model_id)
        return tuple(
            tier
            for tier in self._pricing_by_model.get(model_id, ())
            if (region_id is None or tier.region_id == region_id)
            and (currency is None or tier.currency == currency)
            and (provider_id is None or tier.provider_id == provider_id)
        )

    def get_provider_sources(
        self,
        model_id: str,
        kinds: Iterable[ProviderSourceKind] | None = None,
    ) -> tuple[ProviderSource, ...]:
        self.require_model(model_id)
        sources = self._provider_sources_by_model.get(model_id, ())
        if kinds is None:
            return sources
        requested = set(kinds)
        return tuple(source for source in sources if source.kind in requested)

    def resolve_exact_reference(
        self,
        query: str,
        provider_id: ProviderId | None = None,
    ) -> ExactModelResolution:
        if not query or query.strip() != query:
            raise ValueError("model reference must be non-empty without surrounding whitespace")
        matches = (
            set(self._exact_references.get(query, ()))
            if provider_id is None
            else set(self._provider_references.get((provider_id, query), ()))
        )
        ordered = tuple(sorted(matches))
        status = (
            ExactResolutionStatus.UNKNOWN
            if not ordered
            else ExactResolutionStatus.EXACT
            if len(ordered) == 1
            else ExactResolutionStatus.AMBIGUOUS
        )
        return ExactModelResolution(query=query, status=status, model_ids=ordered)

    def _validate_and_index(self) -> None:
        self._models_by_id = self._validate_catalog()
        self._benchmark_definitions = self._validate_benchmarks()
        self._benchmark_observations_by_model = self._index_benchmark_observations()
        self._arena_observations_by_model = self._validate_and_index_arena()
        self._provider_sources_by_model = self._validate_and_index_provider_sources()
        self._pricing_by_model = self._validate_and_index_pricing()
        self._exact_references, self._provider_references = self._index_exact_references()

    def _validate_catalog(self) -> dict[str, CatalogModel]:
        if not self._catalog.models:
            _fail("catalog.models: expected at least one model")
        models_by_id: dict[str, CatalogModel] = {}
        alias_owners: dict[tuple[str, str], str] = {}
        provider_owners: dict[tuple[ProviderId, str], str] = {}
        for model in self._catalog.models:
            if model.id in models_by_id:
                _fail(f"catalog.models: duplicate model ID {model.id}")
            models_by_id[model.id] = model
            for source_index, source in enumerate(model.sources):
                _validated_https_host(source.url, f"catalog model {model.id} source[{source_index}]")
            alias_groups = (
                ("aa", model.aliases.aa_slugs),
                ("arena", model.aliases.arena_names),
                ("benchmark", model.aliases.benchmark_version_ids),
            )
            for namespace, aliases in alias_groups:
                if len(aliases) != len(set(aliases)):
                    _fail(f"catalog model {model.id}: duplicate {namespace} aliases")
                for alias in aliases:
                    _assert_clean_text(alias, f"catalog model {model.id} {namespace} alias")
                    key = (namespace, alias)
                    previous = alias_owners.get(key)
                    if previous is not None and previous != model.id:
                        _fail(f"catalog alias {alias!r} belongs to both {previous} and {model.id}")
                    alias_owners[key] = model.id
            binding_keys: set[tuple[ProviderId, str]] = set()
            for binding in model.aliases.provider_models:
                _assert_clean_text(binding.provider_model_id, f"catalog model {model.id} providerModelId")
                key = (binding.provider_id, binding.provider_model_id)
                if key in binding_keys:
                    _fail(f"catalog model {model.id}: duplicate provider binding {key}")
                binding_keys.add(key)
                previous = provider_owners.get(key)
                if previous is not None and previous != model.id:
                    _fail(f"provider binding {key} belongs to both {previous} and {model.id}")
                provider_owners[key] = model.id
        return dict(sorted(models_by_id.items()))

    def _validate_benchmarks(self) -> dict[BenchmarkId, BenchmarkDefinition]:
        definitions: dict[BenchmarkId, BenchmarkDefinition] = {}
        for definition in self._evidence.benchmark_definitions:
            if definition.id in definitions:
                _fail(f"benchmarkDefinitions: duplicate benchmark ID {definition.id}")
            _validated_https_host(definition.source_url, f"benchmark definition {definition.id} sourceUrl")
            definitions[definition.id] = definition
        return dict(sorted(definitions.items(), key=lambda item: item[0].value))

    def _index_benchmark_observations(self) -> dict[str, tuple[BenchmarkObservation, ...]]:
        indexed: defaultdict[str, list[BenchmarkObservation]] = defaultdict(list)
        seen: set[tuple[str, BenchmarkId]] = set()
        for observation in self._evidence.benchmark_observations:
            model = self._models_by_id.get(observation.model_id)
            if model is None:
                _fail(f"benchmark observation references unknown model {observation.model_id}")
            definition = self._benchmark_definitions.get(observation.benchmark_id)
            if definition is None:
                _fail(f"benchmark observation references unknown benchmark {observation.benchmark_id}")
            if observation.definition != definition:
                _fail(
                    f"benchmark observation {observation.model_id}/{observation.benchmark_id} "
                    "does not embed the canonical definition"
                )
            if not definition.calibration.min <= observation.value <= definition.calibration.max:
                _fail(
                    f"benchmark observation {observation.model_id}/{observation.benchmark_id} "
                    "falls outside its calibration bounds"
                )
            key = (observation.model_id, observation.benchmark_id)
            if key in seen:
                _fail(f"duplicate benchmark observation {observation.model_id}/{observation.benchmark_id}")
            seen.add(key)
            if (
                observation.benchmark_id not in _AA_BENCHMARK_IDS
                and observation.model_version not in model.aliases.benchmark_version_ids
            ):
                _fail(
                    f"benchmark modelVersion {observation.model_version!r} is not registered "
                    f"for {observation.model_id}"
                )
            indexed[observation.model_id].append(observation)
        return {
            model_id: tuple(sorted(observations, key=lambda item: item.benchmark_id.value))
            for model_id, observations in sorted(indexed.items())
        }

    def _validate_and_index_arena(self) -> dict[str, tuple[ArenaObservation, ...]]:
        _validated_https_host(self._evidence.arena.source_url, "arena.sourceUrl")
        indexed: defaultdict[str, list[ArenaObservation]] = defaultdict(list)
        seen: set[tuple[str, ArenaDimension]] = set()
        for observation in self._evidence.arena.observations:
            model = self._models_by_id.get(observation.model_id)
            if model is None:
                _fail(f"Arena observation references unknown model {observation.model_id}")
            key = (observation.model_id, observation.dimension)
            if key in seen:
                _fail(f"duplicate Arena observation {observation.model_id}/{observation.dimension}")
            seen.add(key)
            if observation.model_version not in model.aliases.arena_names:
                _fail(
                    f"Arena modelVersion {observation.model_version!r} is not registered "
                    f"for {observation.model_id}/{observation.dimension}"
                )
            indexed[observation.model_id].append(observation)
        return {
            model_id: tuple(sorted(observations, key=lambda item: item.dimension.value))
            for model_id, observations in sorted(indexed.items())
        }

    def _validate_and_index_provider_sources(self) -> dict[str, tuple[ProviderSource, ...]]:
        indexed: defaultdict[str, list[ProviderSource]] = defaultdict(list)
        seen: set[tuple[str, str, ProviderId, ProviderSourceKind, str]] = set()
        for source in self._evidence.provider_sources:
            model = self._models_by_id.get(source.model_id)
            if model is None:
                _fail(f"provider source references unknown model {source.model_id}")
            binding = (source.provider_id, source.provider_model_id)
            registered = {(item.provider_id, item.provider_model_id) for item in model.aliases.provider_models}
            if binding not in registered:
                _fail(f"provider binding {binding} is not registered for {source.model_id}")
            host = _validated_https_host(source.url, f"provider source {source.model_id} URL")
            if host not in _PROVIDER_SOURCE_HOSTS[source.provider_id]:
                _fail(f"provider source host {host} is not allowlisted for {source.provider_id}")
            key = (source.model_id, source.provider_model_id, source.provider_id, source.kind, source.url)
            if key in seen:
                _fail(f"duplicate provider source {key}")
            seen.add(key)
            indexed[source.model_id].append(source)
        return {
            model_id: tuple(
                sorted(
                    sources,
                    key=lambda item: (item.provider_id.value, item.provider_model_id, item.kind.value, item.url),
                )
            )
            for model_id, sources in sorted(indexed.items())
        }

    def _validate_and_index_pricing(self) -> dict[str, tuple[PricingTier, ...]]:
        pricing_sources = {
            (source.model_id, source.provider_model_id, source.provider_id, source.url, source.observed_at)
            for sources in self._provider_sources_by_model.values()
            for source in sources
            if source.kind == ProviderSourceKind.PRICING
        }
        offers: defaultdict[str, list[PricingTier]] = defaultdict(list)
        for tier in self._evidence.pricing:
            model = self._models_by_id.get(tier.model_id)
            if model is None:
                _fail(f"pricing tier references unknown model {tier.model_id}")
            binding = (tier.provider_id, tier.provider_model_id)
            registered = {(item.provider_id, item.provider_model_id) for item in model.aliases.provider_models}
            if binding not in registered:
                _fail(f"pricing provider binding {binding} is not registered for {tier.model_id}")
            host = _validated_https_host(tier.source_url, f"pricing offer {tier.offer_id} sourceUrl")
            if host not in _PROVIDER_SOURCE_HOSTS[tier.provider_id]:
                _fail(f"pricing source host {host} is not allowlisted for {tier.provider_id}")
            source_key = (tier.model_id, tier.provider_model_id, tier.provider_id, tier.source_url, tier.observed_at)
            if source_key not in pricing_sources:
                _fail(f"pricing source is not allowlisted for {tier.model_id}/{tier.provider_model_id}")
            expected_stale_after = tier.observed_at + timedelta(days=PRICE_FRESHNESS_DAYS)
            if tier.stale_after != expected_stale_after:
                _fail(
                    f"pricing offer {tier.offer_id} staleAfter must be exactly "
                    f"{PRICE_FRESHNESS_DAYS} days after observedAt"
                )
            if tier.valid_through is not None and tier.valid_through < tier.observed_at:
                _fail(f"pricing offer {tier.offer_id} validThrough precedes observedAt")
            offers[tier.offer_id].append(tier)

        identities: dict[tuple[object, ...], str] = {}
        indexed: defaultdict[str, list[PricingTier]] = defaultdict(list)
        for offer_id, unsorted_tiers in offers.items():
            tiers = sorted(unsorted_tiers, key=lambda item: item.min_input_tokens_exclusive)
            first = tiers[0]
            metadata = self._pricing_metadata(first)
            if any(self._pricing_metadata(tier) != metadata for tier in tiers[1:]):
                _fail(f"pricing tiers for offer {offer_id} have inconsistent metadata")
            tier_ranges = {
                (tier.min_input_tokens_exclusive, tier.max_input_tokens_inclusive) for tier in tiers
            }
            if len(tier_ranges) != len(tiers):
                _fail(f"pricing offer {offer_id} contains duplicate tiers")
            if first.min_input_tokens_exclusive != 0:
                _fail(f"pricing offer {offer_id} must start at 0 input tokens")
            for previous, current in zip(tiers[:-1], tiers[1:], strict=True):
                if previous.max_input_tokens_inclusive is None:
                    _fail(f"pricing offer {offer_id} has a tier after an unbounded tier")
                if current.min_input_tokens_exclusive != previous.max_input_tokens_inclusive:
                    _fail(f"pricing offer {offer_id} tiers must be contiguous and non-overlapping")
            identity = (
                first.model_id,
                first.provider_model_id,
                first.provider_id,
                first.region_id,
                first.currency,
                first.unit,
                first.billing_mode,
            )
            previous_offer = identities.get(identity)
            if previous_offer is not None and previous_offer != offer_id:
                _fail(f"pricing identity {identity} is assigned to both {previous_offer} and {offer_id}")
            identities[identity] = offer_id
            indexed[first.model_id].extend(tiers)

        return {
            model_id: tuple(
                sorted(
                    tiers,
                    key=lambda item: (
                        item.provider_id.value,
                        item.region_id.value,
                        item.currency.value,
                        item.offer_id,
                        item.min_input_tokens_exclusive,
                        item.max_input_tokens_inclusive or float("inf"),
                    ),
                )
            )
            for model_id, tiers in sorted(indexed.items())
        }

    @staticmethod
    def _pricing_metadata(tier: PricingTier) -> tuple[object, ...]:
        return (
            tier.model_id,
            tier.provider_model_id,
            tier.provider_id,
            tier.region_id,
            tier.currency,
            tier.unit,
            tier.billing_mode,
            tier.observed_at,
            tier.stale_after,
            tier.valid_through,
            tier.source_url,
        )

    def _index_exact_references(
        self,
    ) -> tuple[dict[str, tuple[str, ...]], dict[tuple[ProviderId, str], tuple[str, ...]]]:
        references: defaultdict[str, set[str]] = defaultdict(set)
        provider_references: defaultdict[tuple[ProviderId, str], set[str]] = defaultdict(set)
        for model in self._models_by_id.values():
            references[model.id].add(model.id)
            references[model.name].add(model.id)
            for alias in (
                *model.aliases.aa_slugs,
                *model.aliases.arena_names,
                *model.aliases.benchmark_version_ids,
            ):
                references[alias].add(model.id)
            for binding in model.aliases.provider_models:
                references[binding.provider_model_id].add(model.id)
                provider_references[(binding.provider_id, binding.provider_model_id)].add(model.id)
        return (
            {key: tuple(sorted(value)) for key, value in references.items()},
            {key: tuple(sorted(value)) for key, value in provider_references.items()},
        )
