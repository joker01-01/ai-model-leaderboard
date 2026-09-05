from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, cast

import pytest

from app.domain.advisor import OfficialSourceKind
from app.domain.errors import RepositoryDataError
from app.repositories.official_sources import OfficialSourcesRepository

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = REPOSITORY_ROOT / "data" / "aa" / "official-sources.json"
OPENAI_ID = "e67e56e3-15cd-43db-b679-da4660a69f41"


def _payload() -> dict[str, Any]:
    return cast(dict[str, Any], json.loads(REGISTRY_PATH.read_text(encoding="utf-8")))


def _load_payload(tmp_path: Path, payload: dict[str, Any]) -> OfficialSourcesRepository:
    path = tmp_path / "official-sources.json"
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return OfficialSourcesRepository.load(path)


def test_loads_five_reviewed_creator_bindings() -> None:
    repository = OfficialSourcesRepository.load()

    assert len(repository.creator_ids) == 5
    assert OPENAI_ID in repository.creator_ids
    assert [source.kind for source in repository.sources_for(OPENAI_ID)] == [
        OfficialSourceKind.OFFICIAL_SITE,
        OfficialSourceKind.OFFICIAL_GITHUB,
    ]
    assert repository.sources_for("unregistered") == ()


@pytest.mark.parametrize(
    "url",
    [
        "https://openai.com/research",
        "https://platform.openai.com/docs",
        "https://openai.com:443/research?version=current",
        "https://github.com/openai",
        "https://github.com/OpenAI/openai-python",
    ],
)
def test_accepts_only_urls_bound_to_the_candidate_creator(url: str) -> None:
    match = OfficialSourcesRepository.load().validate_citation_url(OPENAI_ID, url)

    assert match is not None
    assert match.creator_id == OPENAI_ID


@pytest.mark.parametrize(
    "url",
    [
        "http://openai.com/research",
        "https://openai.com.evil.example/research",
        "https://evilopenai.com/research",
        "https://user@openai.com/research",
        "https://openai.com:8443/research",
        "https://openai.com/research#fragment",
        "https://github.com/not-openai/repository",
        "https://github.com/openai/%2e%2e/not-openai/repository",
        "https://openai.com/" + "x" * 2_048,
    ],
)
def test_rejects_unbound_or_ambiguous_citation_urls(url: str) -> None:
    assert OfficialSourcesRepository.load().validate_citation_url(OPENAI_ID, url) is None


def test_revalidates_every_redirect_against_the_same_creator() -> None:
    repository = OfficialSourcesRepository.load()

    accepted = repository.validate_citation_url(
        OPENAI_ID,
        "https://github.com/openai/openai-python",
        redirect_chain=("https://openai.com/research",),
    )
    rejected = repository.validate_citation_url(
        OPENAI_ID,
        "https://github.com/openai/openai-python",
        redirect_chain=("https://example.com/redirect",),
    )

    assert accepted is not None
    assert rejected is None


def test_validates_artificial_analysis_separately_from_creator_sources() -> None:
    repository = OfficialSourcesRepository.load()

    match = repository.validate_aa_citation_url("https://artificialanalysis.ai/models")

    assert match is not None
    assert match.source_kind == OfficialSourceKind.ARTIFICIAL_ANALYSIS
    assert match.creator_id is None
    assert repository.validate_citation_url(OPENAI_ID, "https://artificialanalysis.ai/models") is None


def test_normalizes_international_citation_hosts_through_idna(tmp_path: Path) -> None:
    payload = _payload()
    payload["creators"] = [
        {
            "creatorId": "idna-creator",
            "sources": [
                {
                    "kind": "official_site",
                    "host": "xn--bcher-kva.example",
                    "allowSubdomains": False,
                    "pathPrefix": "/",
                }
            ],
        }
    ]
    repository = _load_payload(tmp_path, payload)

    assert repository.validate_citation_url("idna-creator", "https://bücher.example/docs") is not None


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.update({"unexpected": True}),
        lambda value: value["creators"].append(copy.deepcopy(value["creators"][0])),
        lambda value: value["creators"][0]["sources"].append(
            copy.deepcopy(value["creators"][0]["sources"][0])
        ),
        lambda value: value["creators"][0]["sources"][0].update({"host": "opénai.example"}),
        lambda value: value["creators"][0]["sources"][1].update({"pathPrefix": "/openai/repo/"}),
        lambda value: value["creators"][0]["sources"][1].update({"allowSubdomains": True}),
        lambda value: value["creators"][0]["sources"][1].update(
            {"kind": "official_site", "pathPrefix": "/"}
        ),
        lambda value: value["creators"][0]["sources"][0].update({"kind": "artificial_analysis"}),
    ],
)
def test_rejects_registry_contract_drift(tmp_path: Path, mutate: Any) -> None:
    payload = _payload()
    mutate(payload)

    with pytest.raises(RepositoryDataError, match="failed to load official-source registry"):
        _load_payload(tmp_path, payload)
