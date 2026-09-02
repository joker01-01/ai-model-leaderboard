"""Async graph adapter over the five typed ModelOps tool functions."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.errors import ToolResult
from app.domain.models import (
    GetModelBenchmarksInput,
    GetModelPricingInput,
    ListModelsData,
    ListModelsInput,
    ModelBenchmarksData,
    ModelPricingData,
    PrepareDataUpdateInput,
    SearchProviderDocsData,
    SearchProviderDocsInput,
    UpdateProposal,
)
from app.repositories.leaderboard import LeaderboardRepository
from app.tools import (
    ProviderDocumentClient,
    get_model_benchmarks,
    get_model_pricing,
    list_models,
    prepare_data_update,
    search_provider_docs,
)


@dataclass(frozen=True, slots=True)
class ModelOpsToolExecutor:
    repository: LeaderboardRepository
    provider_document_client: ProviderDocumentClient

    async def list_models(self, request: ListModelsInput) -> ToolResult[ListModelsData]:
        return list_models(request, repository=self.repository)

    async def get_model_benchmarks(
        self,
        request: GetModelBenchmarksInput,
    ) -> ToolResult[ModelBenchmarksData]:
        return get_model_benchmarks(request, repository=self.repository)

    async def get_model_pricing(
        self,
        request: GetModelPricingInput,
    ) -> ToolResult[ModelPricingData]:
        return get_model_pricing(request, repository=self.repository)

    async def search_provider_docs(
        self,
        request: SearchProviderDocsInput,
    ) -> ToolResult[SearchProviderDocsData]:
        return await search_provider_docs(
            request,
            repository=self.repository,
            client=self.provider_document_client,
        )

    async def prepare_data_update(
        self,
        request: PrepareDataUpdateInput,
    ) -> ToolResult[UpdateProposal]:
        return prepare_data_update(request, repository=self.repository)
