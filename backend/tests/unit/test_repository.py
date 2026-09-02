from __future__ import annotations

import copy
import json
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.domain.errors import RepositoryDataError, RepositoryLookupError
from app.domain.models import (
    BenchmarkId,
    CatalogSnapshot,
    CurrencyCode,
    EvidenceSnapshot,
    ExactResolutionStatus,
    ProviderId,
    RegionId,
)
from app.repositories.leaderboard import LeaderboardRepository, pricing_evidence_cutoff

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
GENERATED_DIR = REPOSITORY_ROOT / "data" / "modelops" / "generated"


def _payloads() -> tuple[dict[str, Any], dict[str, Any]]:
    catalog = json.loads((GENERATED_DIR / "catalog.json").read_text(encoding="utf-8"))
    evidence = json.loads((GENERATED_DIR / "evidence.json").read_text(encoding="utf-8"))
    return catalog, evidence


def _repository(catalog: dict[str, Any], evidence: dict[str, Any]) -> LeaderboardRepository:
    catalog_model = CatalogSnapshot.model_validate_json(json.dumps(catalog, ensure_ascii=False))
    evidence_model = EvidenceSnapshot.model_validate_json(json.dumps(evidence, ensure_ascii=False))
    return LeaderboardRepository(catalog_model, evidence_model)


def test_loads_complete_snapshots_as_stable_read_only_views() -> None:
    repository = LeaderboardRepository.load()

    assert len(repository.model_ids) == 20
    assert repository.model_ids == tuple(sorted(repository.model_ids))
    assert len(repository.get_benchmark_definitions()) == 6
    assert len(repository.get_benchmark_observations("qwen-3-5")) == 4
    assert len(repository.get_arena_observations("qwen-3-5")) == 2
    assert len(repository.get_pricing_tiers("qwen-3-5")) == 7
    assert len(repository.get_provider_sources("qwen-3-5")) == 2
    assert isinstance(repository.get_pricing_tiers("qwen-3-5"), tuple)
    assert repository.get_pricing_tiers("qwen-3-5")[0].input_price == Decimal("0.172")
    assert isinstance(repository.get_pricing_tiers("qwen-3-5")[0].input_price, Decimal)

    model = repository.require_model("qwen-3-5")
    with pytest.raises(ValidationError):
        model.name = "changed"


def test_exact_lookup_never_falls_back_to_fuzzy_matching() -> None:
    repository = LeaderboardRepository.load()

    assert repository.resolve_exact_reference("Qwen3.5-397B-A17B").model_ids == ("qwen-3-5",)
    assert repository.resolve_exact_reference("qwen3.5-397b-a17b").model_ids == ("qwen-3-5",)
    assert repository.resolve_exact_reference("DeepSeek-V4-Pro-0813").model_ids == ("deepseek-v4-pro",)
    assert repository.resolve_exact_reference("Qwen3.5").status == ExactResolutionStatus.UNKNOWN
    assert repository.resolve_exact_reference("QWEN3.5-397B-A17B").status == ExactResolutionStatus.UNKNOWN
    assert repository.resolve_exact_reference(
        "Qwen3.5-397B-A17B",
        ProviderId.QWEN,
    ).model_ids == ("qwen-3-5",)
    assert repository.resolve_exact_reference(
        "Qwen3.5-397B-A17B",
        ProviderId.OPENAI,
    ).status == ExactResolutionStatus.UNKNOWN
    with pytest.raises(RepositoryLookupError, match="unknown exact model ID"):
        repository.require_model("qwen-3")


def test_provider_model_id_collisions_stay_ambiguous_without_provider_context() -> None:
    catalog, evidence = _payloads()
    gpt = next(model for model in catalog["models"] if model["id"] == "gpt-56-sol")
    gpt["aliases"]["providerModels"].append(
        {
            "providerId": "openai",
            "providerModelId": "qwen3.5-397b-a17b",
        }
    )

    repository = _repository(catalog, evidence)

    resolution = repository.resolve_exact_reference("qwen3.5-397b-a17b")
    assert resolution.status == ExactResolutionStatus.AMBIGUOUS
    assert resolution.model_ids == ("gpt-56-sol", "qwen-3-5")
    assert repository.resolve_exact_reference(
        "qwen3.5-397b-a17b",
        ProviderId.ALIBABA_CLOUD_MODEL_STUDIO,
    ).model_ids == ("qwen-3-5",)
    assert repository.resolve_exact_reference(
        "qwen3.5-397b-a17b",
        ProviderId.OPENAI,
    ).model_ids == ("gpt-56-sol",)


def test_aa_display_version_is_not_mistaken_for_a_source_slug() -> None:
    repository = LeaderboardRepository.load()
    model = repository.require_model("qwen-3-5")
    observation = next(
        item
        for item in repository.get_benchmark_observations(model.id)
        if item.benchmark_id == BenchmarkId.AA_CODING
    )

    assert observation.model_version not in model.aliases.aa_slugs
    assert observation.model_version == "Qwen3.5 397B A17B (Reasoning)"


def test_rejects_non_aa_version_and_embedded_definition_drift() -> None:
    catalog, evidence = _payloads()
    changed = copy.deepcopy(evidence)
    observation = next(
        item
        for item in changed["benchmarkObservations"]
        if item["modelId"] == "qwen-3-5" and item["benchmarkId"] == "gpqa-diamond"
    )
    observation["modelVersion"] = "qwen-family-latest"
    with pytest.raises(RepositoryDataError, match="benchmark modelVersion"):
        _repository(catalog, changed)

    changed = copy.deepcopy(evidence)
    changed["benchmarkObservations"][0]["definition"]["label"] = "drifted label"
    with pytest.raises(RepositoryDataError, match="canonical definition"):
        _repository(catalog, changed)


def test_rejects_unknown_models_duplicate_observations_and_arena_alias_drift() -> None:
    catalog, evidence = _payloads()
    changed = copy.deepcopy(evidence)
    changed["benchmarkObservations"][0]["modelId"] = "unknown-model"
    with pytest.raises(RepositoryDataError, match="unknown model"):
        _repository(catalog, changed)

    changed = copy.deepcopy(evidence)
    changed["benchmarkObservations"].append(copy.deepcopy(changed["benchmarkObservations"][0]))
    with pytest.raises(RepositoryDataError, match="duplicate benchmark observation"):
        _repository(catalog, changed)

    changed = copy.deepcopy(evidence)
    changed["arena"]["observations"][0]["modelVersion"] = "family-latest"
    with pytest.raises(RepositoryDataError, match="Arena modelVersion"):
        _repository(catalog, changed)


def test_rejects_provider_pair_and_source_host_violations() -> None:
    catalog, evidence = _payloads()
    changed = copy.deepcopy(evidence)
    changed["providerSources"][0]["providerModelId"] = "not-registered"
    with pytest.raises(RepositoryDataError, match="provider binding"):
        _repository(catalog, changed)

    changed = copy.deepcopy(evidence)
    changed["providerSources"][0]["url"] = "https://example.com/model-card"
    with pytest.raises(RepositoryDataError, match="not allowlisted"):
        _repository(catalog, changed)


def test_rejects_pricing_source_freshness_and_tier_drift() -> None:
    catalog, evidence = _payloads()
    changed = copy.deepcopy(evidence)
    changed["pricing"][0]["sourceUrl"] = "https://www.alibabacloud.com/help/en/model-studio/model-pricing"
    with pytest.raises(RepositoryDataError, match="pricing source is not allowlisted"):
        _repository(catalog, changed)

    changed = copy.deepcopy(evidence)
    changed["pricing"][0]["staleAfter"] = "2026-10-03"
    with pytest.raises(RepositoryDataError, match="exactly 30 days"):
        _repository(catalog, changed)

    changed = copy.deepcopy(evidence)
    second_tier = next(
        item
        for item in changed["pricing"]
        if item["offerId"] == "alibaba-qwen-3-5-cn-beijing-usd"
        and item["minInputTokensExclusive"] == 128000
    )
    second_tier["minInputTokensExclusive"] = 128001
    with pytest.raises(RepositoryDataError, match="contiguous and non-overlapping"):
        _repository(catalog, changed)


def test_pricing_filters_and_inclusive_cutoff_are_deterministic() -> None:
    repository = LeaderboardRepository.load()
    tiers = repository.get_pricing_tiers(
        "qwen-3-5",
        region_id=RegionId.CN_BEIJING,
        currency=CurrencyCode.USD,
        provider_id=ProviderId.ALIBABA_CLOUD_MODEL_STUDIO,
    )

    assert [(tier.min_input_tokens_exclusive, tier.max_input_tokens_inclusive) for tier in tiers] == [
        (0, 128000),
        (128000, 256000),
    ]
    assert all(pricing_evidence_cutoff(tier).isoformat() == "2026-10-02" for tier in tiers)


def test_load_wraps_strict_schema_errors(tmp_path: Path) -> None:
    catalog, evidence = _payloads()
    catalog["unexpected"] = True
    catalog_path = tmp_path / "catalog.json"
    evidence_path = tmp_path / "evidence.json"
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False), encoding="utf-8")
    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False), encoding="utf-8")

    with pytest.raises(RepositoryDataError, match="failed to load catalog snapshot"):
        LeaderboardRepository.load(catalog_path, evidence_path)
