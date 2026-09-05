"""Strict read-only repository for the complete source-native AA snapshot."""

from __future__ import annotations

from pathlib import Path

from pydantic import ValidationError

from app.domain.advisor import AaPublicModel, AaPublicSnapshot
from app.domain.errors import RepositoryDataError

AA_PUBLIC_SOURCE_URL = "https://artificialanalysis.ai/api/v2/language/models/free"
AA_PUBLIC_SCHEMA_FINGERPRINT = "sha256:38d8da098c352a8a014cfc883db118e35ea640b15d60fc1742ea8e10b155bb37"


class AaSnapshotRepository:
    """Validated immutable access to public AA rows without curated joins."""

    def __init__(self, snapshot: AaPublicSnapshot) -> None:
        if snapshot.source.url != AA_PUBLIC_SOURCE_URL:
            raise RepositoryDataError("public AA snapshot uses an unsupported source URL")
        if snapshot.source.schema_fingerprint != AA_PUBLIC_SCHEMA_FINGERPRINT:
            raise RepositoryDataError("public AA snapshot uses an unsupported schema fingerprint")
        self._snapshot = snapshot
        self._models_by_id = {model.source_id: model for model in snapshot.models}

    @classmethod
    def load(cls, path: str | Path | None = None) -> AaSnapshotRepository:
        repository_root = Path(__file__).resolve().parents[3]
        resolved_path = (
            Path(path)
            if path is not None
            else repository_root / "data" / "aa" / "generated" / "snapshot.json"
        )
        try:
            snapshot = AaPublicSnapshot.model_validate_json(
                resolved_path.read_text(encoding="utf-8"),
                strict=True,
                by_alias=True,
                by_name=False,
            )
        except (OSError, ValidationError, ValueError) as exc:
            raise RepositoryDataError(f"failed to load public AA snapshot {resolved_path}: {exc}") from exc
        return cls(snapshot)

    @property
    def snapshot(self) -> AaPublicSnapshot:
        return self._snapshot

    @property
    def models(self) -> tuple[AaPublicModel, ...]:
        return self._snapshot.models

    def get(self, source_id: str) -> AaPublicModel | None:
        return self._models_by_id.get(source_id)
