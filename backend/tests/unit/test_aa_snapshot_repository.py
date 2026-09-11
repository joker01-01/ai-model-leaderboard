from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, cast

import pytest

from app.domain.errors import RepositoryDataError
from app.repositories.aa_snapshot import (
    AA_PUBLIC_SCHEMA_FINGERPRINT,
    AA_PUBLIC_SOURCE_URL,
    AaSnapshotRepository,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SNAPSHOT_PATH = REPOSITORY_ROOT / "data" / "aa" / "generated" / "snapshot.json"


def _payload() -> dict[str, Any]:
    return cast(dict[str, Any], json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8")))


def _load_payload(tmp_path: Path, payload: dict[str, Any]) -> AaSnapshotRepository:
    path = tmp_path / "snapshot.json"
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return AaSnapshotRepository.load(path)


def test_loads_complete_public_snapshot_without_curated_projection() -> None:
    payload = _payload()
    repository = AaSnapshotRepository.load()

    assert repository.snapshot.schema_version == 1
    assert repository.snapshot.source.url == AA_PUBLIC_SOURCE_URL
    assert repository.snapshot.source.schema_fingerprint == AA_PUBLIC_SCHEMA_FINGERPRINT
    assert [model.source_id for model in repository.models] == [
        model["sourceId"] for model in payload["models"]
    ]
    assert repository.snapshot.source.pagination.fetched_row_count == len(repository.models)
    assert repository.get(repository.models[0].source_id) is repository.models[0]
    assert repository.get("curated-model-id") is None


@pytest.mark.parametrize("row_delta", [-1, 1])
def test_preserves_complete_membership_after_model_changes(tmp_path: Path, row_delta: int) -> None:
    payload = _payload()
    if row_delta < 0:
        payload["models"].pop()
    else:
        added = copy.deepcopy(payload["models"][-1])
        added["sourceId"] += "-new"
        payload["models"].append(added)
    pagination = payload["source"]["pagination"]
    pagination["fetchedRowCount"] = len(payload["models"])
    pagination["totalPages"] = (
        len(payload["models"]) + pagination["pageSize"] - 1
    ) // pagination["pageSize"]
    if pagination["declaredTotalRows"] is not None:
        pagination["declaredTotalRows"] = len(payload["models"])

    repository = _load_payload(tmp_path, payload)

    assert [model.source_id for model in repository.models] == [
        model["sourceId"] for model in payload["models"]
    ]
    assert all(repository.get(model.source_id) is model for model in repository.models)


def test_preserves_zero_metrics_and_nullable_identity(tmp_path: Path) -> None:
    payload = _payload()
    payload["models"][0]["creatorId"] = None
    payload["models"][0]["creatorName"] = None
    payload["models"][0]["inputPricePerMillion"] = 0
    payload["models"][0]["outputPricePerMillion"] = 0

    model = _load_payload(tmp_path, payload).models[0]

    assert model.creator_id is None
    assert model.creator_name is None
    assert model.input_price_per_million == 0
    assert model.output_price_per_million == 0


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.update({"unexpected": True}),
        lambda value: value.update({"schema_version": value.pop("schemaVersion")}),
        lambda value: value["source"].update({"schemaFingerprint": "sha256:unsupported"}),
        lambda value: value["source"].update({"url": "https://example.com/models"}),
        lambda value: value["models"].__setitem__(1, copy.deepcopy(value["models"][0])),
        lambda value: value["models"].pop(),
        lambda value: value["models"].__setitem__(slice(0, 2), list(reversed(value["models"][:2]))),
        lambda value: value["models"][0].update({"observedAt": "2026-09-03"}),
        lambda value: value["models"][0].update({"outputPricePerMillion": -0.01}),
        lambda value: value["models"][0].update({"intelligence": float("nan")}),
        lambda value: value["source"]["pagination"].update({"totalPages": 3}),
    ],
)
def test_rejects_snapshot_contract_drift(
    tmp_path: Path,
    mutate: Any,
) -> None:
    payload = _payload()
    mutate(payload)

    with pytest.raises(RepositoryDataError, match="failed to load|unsupported"):
        _load_payload(tmp_path, payload)
