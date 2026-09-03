# Project State

## Goal

Upgrade the existing AI Model Leaderboard into the bounded ModelOps Agent MVP defined in `docs/modelops-agent-plan.md`, while preserving exact-version matching, current ranking behavior, automated review PRs, and the human publication gate.

## Architecture

Current verified system:

```text
React 19 + TypeScript + Vite static frontend
  <- curated TypeScript model and benchmark data
  <- generated Artificial Analysis and Arena snapshots
  <- deterministic ModelOps catalog/evidence JSON adapter
  <- daily Node.js sync + adapter export/tests that prepare a review PR
  -> human merge to main
  -> GitHub Pages deployment

Python 3.12 Agent core
  <- strict read-only repository over the same generated JSON
  -> five typed read-only/pure tools
  -> deterministic evidence verifier + bounded LangGraph workflow
  -> typed AgentAnswer / awaiting_human_review proposal
  <- DeepSeek V4 Flash through an OpenAI-compatible Responses structured-output gateway
  <- bounded exact-allowlist HTTP provider-document client

Independent FastAPI service
  -> GET /healthz
  -> POST /api/v1/agent/query:invoke
  -> POST /api/v1/agent/query as typed SSE
  -> disconnect cancellation; no persistence or replay
```

Next target direction:

```text
Existing leaderboard + Agent Panel
  -> configured independent FastAPI SSE API
  -> current bounded LangGraph core and evidence/proposal views
```

The frontend remains usable when no Agent API is configured. FastAPI must be deployed separately from GitHub Pages; no public backend target has been selected yet.

## Current Status

- Repository baseline and full ModelOps architecture have been reviewed.
- `AGENTS.md` now records durable invariants, commands, generated-file rules, publication boundaries, and risk-proportionate review guidance.
- `docs/modelops-agent-plan.md` contains the approved architecture, file-level scope, graph state, tool contracts, SSE contract, staged implementation plan, and acceptance criteria.
- `docs/reuse-assessment.md` records why the MVP will extend this repository instead of forking a generic Agent template.
- Phase A is implemented and verified: static benchmark versions, AA slugs, Arena names, and exact `(providerId, providerModelId)` pairs are shared; reviewed evidence is exported deterministically; focused tests cover strict failures plus public/editorial ranking equivalence.
- Phase B is implemented and verified: strict immutable Pydantic contracts, generated-data repository validation, five typed tools, deterministic evidence verification, a low-level LangGraph state machine, dependency-injected fake gateway/document client, and pure update proposals.
- Phase C is implemented and verified: environment-backed configuration, FastAPI lifespan/CORS/health, snake_case streaming and non-streaming Agent endpoints, typed SSE sequencing/heartbeat/disconnect cancellation, a DeepSeek V4 Flash OpenAI-compatible Responses gateway, and a bounded HTTP provider-document client.
- The HTTP document boundary uses repository-owned exact URLs, total and per-operation timeouts, bounded identity-encoded text responses, and redirect binding to the same `(modelId, providerId, providerModelId, kind)` metadata. Cross-binding redirects cannot be misattributed as evidence.
- The three graph intents are `recommend`, `explain_unranked`, and `prepare_update`. Missing user inputs end in `needs_clarification`; evidence gaps produce bounded completed answers; unrecoverable gateway/tool failures end in `failed`; valid proposals end in `awaiting_human_review` without writes.
- The offline backend suite contains 91 repository/tool/graph/gateway/API tests. The deterministic evaluation set contains 24 passing scenarios spanning recommendation, pricing boundaries, missing/stale evidence, exact/unknown/ambiguous version explanations, pure proposals, filter reasons, and internal failures.
- The generated adapter currently contains 20 models, 13 registered static benchmark versions, 9 provider bindings, 6 benchmark definitions, 62 benchmark observations, 18 Arena observations, 9 price tiers across 6 provider offers, and 12 allowlisted provider documents.
- The scheduled sync now regenerates and tests the ModelOps adapter before it can prepare a review PR; merge to `main` remains the publication gate.
- Pull requests and pushes to `main` are configured to run the offline generated-data drift check, focused TypeScript data tests, production frontend build, backend pytest/Ruff/mypy gates, and deterministic evals with read-only workflow permissions.

## Important Decisions

- Preserve the existing TypeScript leaderboard instead of replacing it with a generic Agent starter.
- Build the smallest project-specific FastAPI + LangGraph backend; do not add PostgreSQL, pgvector, authentication, persistence, MCP, or multi-Agent orchestration to the MVP.
- Reuse existing model/benchmark data through deterministic generated JSON rather than maintaining an independent Python copy.
- Keep model matching deterministic. LLM output may extract intent and constraints but cannot approve fuzzy version matches.
- Keep Pydantic at the graph and tool boundaries, use `TypedDict` for graph state, and inject repositories/gateways/clients through immutable runtime context rather than graph state.
- Use the low-level LangGraph graph API. The LLM gateway is limited to structured intent/constraint extraction; candidate filtering, evidence verification, ranking, routing, and terminal status are deterministic.
- Use `deepseek-v4-flash` as the default intent-extraction model through `https://api.deepseek.com/responses`; disable reasoning for this bounded extraction call and enforce the final contract with strict local Pydantic validation.
- Only missing user-fillable inputs cause clarification. Missing, stale, ambiguous, or conflicting repository evidence is explained as a bounded result, while unrecoverable internal failures terminate the run.
- Missing price, region, license, or benchmark evidence remains missing; qualitative price tiers cannot prove a monthly-budget constraint.
- Price offers use stable provider/region/offer IDs and per-request token intervals. A tool returns all matching offers in deterministic order and cannot silently select the cheapest one.
- A pricing deployment region is positive evidence for that provider offer, not proof of end-user country availability. Absence is `missing_evidence`, not `unsupported_region`.
- Reviewed prices must use an exact 30-calendar-day review window. The effective inclusive evidence cutoff is the earlier of `staleAfter` and a non-null provider `validThrough` date.
- Agent recommendation order is AA Coding descending, AA Intelligence descending with missing values last, then exact model ID ascending. It is independent of the public leaderboard ranking.
- Provider-document input cannot contain arbitrary URLs. Only registered allowlist entries may be fetched through an injected client, and all normalized query terms must occur in one bounded excerpt before it counts as evidence.
- Provider-document redirects may continue only through registered URLs with the same exact model/provider/provider-model/kind binding as the initial source.
- `prepare_data_update` remains a pure, reviewable proposal operation. It cannot write files, call GitHub, merge, or publish.
- Security review depth is proportional to the touched trust boundary; ordinary documentation/UI/pure-function work does not trigger a broad security audit.

## Known Problems

- Structured prices currently cover only exact Qwen3.5-397B-A17B and ZHIPU/GLM-5.3 offers on Alibaba Cloud Model Studio. Other models remain missing rather than inheriting family-level prices.
- DeepSeek V4 Pro/Flash prices are time-band dependent and are intentionally omitted because the Phase A offer schema does not model time bands.
- Structured negative availability, end-user country availability, and latency evidence are not modeled yet; provider deployment regions alone cannot answer all geographic constraints.
- `npm run sync:data:check` does not fail when generated data would drift.
- The React Agent Panel and general frontend interaction tests do not exist yet; the static leaderboard remains independent of the Agent API.
- A public backend deployment target has not been selected; local integration is sufficient for the MVP implementation stages.
- In the current managed Windows sandbox, `tsx` can fail before project code with `uv_os_get_passwd ... ENOMEM`; the same commands succeed outside that sandbox, so no repository-specific workaround was added.
- The dev extra temporarily caps AnyIO below 4.15 because the current Starlette TestClient still uses an alias deprecated by AnyIO 4.15. Revisit the cap after Starlette migrates the alias.

## Verification

Verified through 2026-09-03 after Phase C implementation:

- `npm ci` succeeded.
- `npm run modelops:data` generated the adapter successfully outside the managed sandbox.
- `npm run modelops:data:check` passed outside the managed sandbox; a deliberate generated-file mutation was also proven to make it exit nonzero before the file was regenerated.
- `npm run test:modelops-data` passed 11/11 focused tests, including exact provider-pair and source-version binding, invalid tier/freshness/currency rejection, evidence cutoff boundaries, provider-host restriction, numeric tier ordering, and ranking-result equivalence.
- `npm run build` succeeded with TypeScript checking for the frontend and ModelOps scripts plus a Vite production build.
- `node --check scripts/sync-data.mjs` succeeded.
- The extracted alias data was deep-compared with the previous inline array: 20 model IDs, 21 AA aliases, and 40 Arena aliases were unchanged.
- README publication claims and the human merge boundary still match the checked GitHub Actions workflows.
- `git diff --check`, an explicit trailing-whitespace scan covering untracked files, and a common secret-pattern scan reported no findings.
- The network-backed `npm run sync:data:check` was not run; external AA/Arena refresh behavior is not claimed as runtime-verified in Phase A.
- `python -m pytest -q` from `backend/` passed all 91 tests after the DeepSeek configuration change, including API integration tests, Responses structured-output gateway contracts, bounded provider-document HTTP behavior, and redirect evidence binding.
- `python -m ruff check app tests evals` passed.
- `python -m mypy app tests evals` passed for 41 source files.
- `python evals/run.py` passed 24/24 deterministic cases with no model-provider or provider-document network calls.
- Before the provider-only change, a clean Python 3.12 virtual environment installed `.[dev]`, reported no broken requirements from `python -m pip check`, passed the then-current 89 tests and 24 evals, and was removed after verification. No dependency changed in the DeepSeek update.
- A manual live smoke through `HttpProviderDocumentClient` reached all 11 distinct exact-allowlisted provider-document URLs represented by 12 source bindings with HTTP 200; there were no redirects, non-200 responses, timeouts, or unavailable responses. Response bodies were not retained or reported.
- A direct live smoke through the configured `deepseek-v4-flash` Responses gateway reached `https://api.deepseek.com/responses`, accepted the complete Pydantic-derived JSON Schema, and returned a locally validated `recommend` intent. The key and response body were not written to the repository or reported.
- `npm run modelops:data:check`, `npm run test:modelops-data` (11/11), and `npm run build` passed outside the managed sandbox after the sandbox-only `tsx` ENOMEM failure reproduced.
- GitHub-hosted `Verify pull request` run `33689799358` passed for implementation commit `173d0e9`, including generated-data checks, frontend build, pytest, Ruff, mypy, and all deterministic Agent evaluations.
- GitHub-hosted `Deploy to GitHub Pages` run `33689799362` passed for implementation commit `173d0e9`.

## Next

1. Phase D: add the React Agent Panel, typed SSE parser, cancellation controls, clarification flow, evidence display, and review-only proposal preview without changing leaderboard ranking behavior.
2. Configure the frontend API URL while keeping the existing static leaderboard usable when no backend is configured.
3. Add focused SSE parser/panel interaction tests, then run the complete frontend, shared-data, backend, and deterministic-eval gates.
4. Select or document the separate backend deployment target; do not add persistence, resumability, authentication, writes, or publication automation without a separately approved scope.
