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
  -> typed POST SSE client + Agent evidence console
     (disabled when VITE_AGENT_API_URL is absent)

Python 3.12 Agent core
  <- strict read-only repository over the same generated JSON
  -> five typed read-only/pure tools
  -> deterministic evidence verifier + bounded LangGraph workflow
  -> typed AgentAnswer / awaiting_human_review proposal
  <- DeepSeek V4 Flash through an OpenAI-compatible Responses structured-output gateway
  <- bounded exact-allowlist HTTP provider-document client

Independent FastAPI service
  -> GET / as browser status/navigation
  -> GET /healthz
  -> POST /api/v1/agent/query:invoke
  -> POST /api/v1/agent/query as typed SSE
  -> disconnect cancellation; no persistence or replay
```

Current deployed backend boundary:

```text
GitHub Pages static leaderboard + Phase D Agent Panel
  -> runtime-validated POST SSE over HTTPS

Public Zeabur HTTPS API
  -> Zeabur HTTPS domain
  -> independent FastAPI SSE API
  -> current bounded LangGraph core and evidence/proposal views
```

The frontend remains usable when no Agent API is configured. The reviewed Pages workflow injects `https://modelops-agent-api.zeabur.app`; the independent backend is deployed as `modelops-agent-api` on a Zeabur-managed Tencent Cloud server in Singapore with 2 vCPU, 2 GB RAM, 40 GB SSD, and 512 GB monthly outbound transfer.

## Current Status

- Repository baseline and full ModelOps architecture have been reviewed.
- `AGENTS.md` now records durable invariants, commands, generated-file rules, publication boundaries, and risk-proportionate review guidance.
- `docs/modelops-agent-plan.md` contains the approved architecture, file-level scope, graph state, tool contracts, SSE contract, staged implementation plan, and acceptance criteria.
- `docs/reuse-assessment.md` records why the MVP will extend this repository instead of forking a generic Agent template.
- Phase A is implemented and verified: static benchmark versions, AA slugs, Arena names, and exact `(providerId, providerModelId)` pairs are shared; reviewed evidence is exported deterministically; focused tests cover strict failures plus public/editorial ranking equivalence.
- Phase B is implemented and verified: strict immutable Pydantic contracts, generated-data repository validation, five typed tools, deterministic evidence verification, a low-level LangGraph state machine, dependency-injected fake gateway/document client, and pure update proposals.
- Phase C is implemented and verified: environment-backed configuration, FastAPI lifespan/CORS/health, snake_case streaming and non-streaming Agent endpoints, typed SSE sequencing/heartbeat/disconnect cancellation, a DeepSeek V4 Flash OpenAI-compatible Responses gateway, and a bounded HTTP provider-document client.
- Phase D is implemented and published: a typed POST SSE client, deep runtime validation of nested wire data, an evidence-console React Panel, request stopping, disconnected fallback, and focused parser/component tests. CI and Pages deployment both gate the build on these tests; application recovery commit `bb9e31e` restored the Phase D tree after the drill.
- Root-level Docker packaging and the Zeabur runbook are implemented. The `modelops-agent-api` service builds from GitHub `main`, runs the repository-root Dockerfile, uses a custom HTTP `/healthz` check, and exposes `https://modelops-agent-api.zeabur.app`. The root route now presents a browser-facing runtime status page while `/healthz` remains the machine health probe.
- Live Phase C/D deployment acceptance passed for the browser-facing root status page, readiness, a real DeepSeek-backed non-streaming recommendation, all three POST SSE product paths through HTTPS checks carrying the production Pages `Origin` header, browser CORS, the published Agent Panel and static leaderboard in the live DOM, deployment recovery, and bounded single-replica stability. The secret remains in Zeabur service variables and is not stored in the repository.
- The HTTP document boundary uses repository-owned exact URLs, total and per-operation timeouts, bounded identity-encoded text responses, and redirect binding to the same `(modelId, providerId, providerModelId, kind)` metadata. Cross-binding redirects cannot be misattributed as evidence.
- The three graph intents are `recommend`, `explain_unranked`, and `prepare_update`. Missing user inputs end in `needs_clarification`; evidence gaps produce bounded completed answers; unrecoverable gateway/tool failures end in `failed`; valid proposals end in `awaiting_human_review` without writes.
- The offline backend suite contains 92 repository/tool/graph/gateway/API tests, including available and unavailable root-page contracts. The deterministic evaluation set contains 24 passing scenarios spanning recommendation, pricing boundaries, missing/stale evidence, exact/unknown/ambiguous version explanations, pure proposals, filter reasons, and internal failures.
- The generated adapter currently contains 20 models, 13 registered static benchmark versions, 9 provider bindings, 6 benchmark definitions, 62 benchmark observations, 18 Arena observations, 9 price tiers across 6 provider offers, and 12 allowlisted provider documents.
- The scheduled sync now regenerates and tests the ModelOps adapter before it can prepare a review PR; merge to `main` remains the publication gate.
- Pull requests and pushes to `main` are configured to run the offline generated-data drift check, focused TypeScript data and Agent UI tests, production frontend build, backend pytest/Ruff/mypy gates, and deterministic evals with read-only workflow permissions.

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
- Zeabur builds the backend from the repository root so the image preserves both `backend/app/` and `data/modelops/generated/`. Start with one Uvicorn worker and no database or persistent volume.
- Zeabur's GitHub integration redeploys on pushes to its linked branch by default. Link only `main` so the human merge remains the backend release gate.

## Known Problems

- Structured prices currently cover only exact Qwen3.5-397B-A17B and ZHIPU/GLM-5.3 offers on Alibaba Cloud Model Studio. Other models remain missing rather than inheriting family-level prices.
- DeepSeek V4 Pro/Flash prices are time-band dependent and are intentionally omitted because the Phase A offer schema does not model time bands.
- Structured negative availability, end-user country availability, and latency evidence are not modeled yet; provider deployment regions alone cannot answer all geographic constraints.
- `npm run sync:data:check` does not fail when generated data would drift.
- Focused Agent Panel tests exist, but the rest of the leaderboard still lacks broad end-to-end interaction coverage.
- The public backend has no authentication or rate limiting. CORS limits browser origins but does not prevent direct scripted requests, so broader exposure needs a separately approved access-control or quota milestone.
- A real client transport disconnect, bounded endpoint-stability observation, and Git-revert deployment/recovery drill have been exercised against Zeabur. The reverted Phase D commit did not change backend build inputs, so the drill verifies revision switching, health continuity, and recovery rather than rollback between behaviorally different backend images. Online logs have not independently proven internal graph-task cancellation; the offline API integration test covers that contract. The control-plane resource graph is a snapshot, not a sustained-load test.
- A local Docker or Podman runtime remains unavailable. Zeabur's remote image build and runtime are verified, but local container reproduction is not.
- In the current managed Windows sandbox, `tsx` can fail before project code with `uv_os_get_passwd ... ENOMEM`; the same commands succeed outside that sandbox, so no repository-specific workaround was added.
- The dev extra temporarily caps AnyIO below 4.15 because the current Starlette TestClient still uses an alias deprecated by AnyIO 4.15. Revisit the cap after Starlette migrates the alias.

## Verification

Verified through 2026-09-04 after deploying the Zeabur backend boundary:

- `npm ci` succeeded.
- `npm run modelops:data` generated the adapter successfully outside the managed sandbox.
- `npm run modelops:data:check` passed outside the managed sandbox; a deliberate generated-file mutation was also proven to make it exit nonzero before the file was regenerated.
- `npm run test:modelops-data` passed 11/11 focused tests, including exact provider-pair and source-version binding, invalid tier/freshness/currency rejection, evidence cutoff boundaries, provider-host restriction, numeric tier ordering, and ranking-result equivalence.
- `npm run build` succeeded with TypeScript checking for the frontend and ModelOps scripts plus a Vite production build.
- `npm run test:agent` passed 30 focused runtime-contract, SSE parser, cancellation, and React Panel tests; malformed streams cancel their response reader and partial failed output is not presented as a completed result.
- `node --check scripts/sync-data.mjs` succeeded.
- The extracted alias data was deep-compared with the previous inline array: 20 model IDs, 21 AA aliases, and 40 Arena aliases were unchanged.
- README publication claims and the human merge boundary still match the checked GitHub Actions workflows.
- `git diff --check`, an explicit trailing-whitespace scan covering untracked files, and a common secret-pattern scan reported no findings.
- The network-backed `npm run sync:data:check` was not run; external AA/Arena refresh behavior is not claimed as runtime-verified in Phase A.
- `python -m pytest -q` from `backend/` passed all 92 tests after adding the browser-facing root status page, including its available/unavailable contracts, API integration tests, Responses structured-output gateway contracts, bounded provider-document HTTP behavior, and redirect evidence binding.
- `python -m ruff check app tests evals` passed.
- `python -m mypy app tests evals` passed for 41 source files.
- `python evals/run.py` passed 24/24 deterministic cases with no model-provider or provider-document network calls.
- Before the provider-only change, a clean Python 3.12 virtual environment installed `.[dev]`, reported no broken requirements from `python -m pip check`, passed the then-current 89 tests and 24 evals, and was removed after verification. No dependency changed in the DeepSeek update.
- A manual live smoke through `HttpProviderDocumentClient` reached all 11 distinct exact-allowlisted provider-document URLs represented by 12 source bindings with HTTP 200; there were no redirects, non-200 responses, timeouts, or unavailable responses. Response bodies were not retained or reported.
- A direct live smoke through the configured `deepseek-v4-flash` Responses gateway reached `https://api.deepseek.com/responses`, accepted the complete Pydantic-derived JSON Schema, and returned a locally validated `recommend` intent. The key and response body were not written to the repository or reported.
- `npm run modelops:data:check`, `npm run test:modelops-data` (11/11), and `npm run build` passed outside the managed sandbox after the sandbox-only `tsx` ENOMEM failure reproduced.
- GitHub-hosted `Verify pull request` run `33689799358` passed for implementation commit `173d0e9`, including generated-data checks, frontend build, pytest, Ruff, mypy, and all deterministic Agent evaluations.
- GitHub-hosted `Deploy to GitHub Pages` run `33689799362` passed for implementation commit `173d0e9`.
- Zeabur built an OCI image from the GitHub `main` source and started one healthy `modelops-agent-api` replica. At the recovery checkpoint, the dashboard reported `Reapply "feat: add ModelOps Agent panel"` as the running revision and `1/1` replicas; later documentation-only commits may trigger another equivalent image build from `main`.
- Zeabur persisted a custom HTTP `GET /healthz` check on port 8080. The public endpoint returned HTTP 200 with `{"status":"ok"}`.
- Landing-page commit `a80321b` passed GitHub Verify run `33838256321` and Pages run `33838256266`. Zeabur redeployed it from `main`; the public root changed from FastAPI's HTTP 404 JSON to HTTP 200 `text/html`, reported `data-status="ok"`, linked the public leaderboard, `/docs`, and `/healthz`, and sent `Cache-Control: no-store`. The public `/healthz` endpoint remained HTTP 200.
- The public non-streaming endpoint returned HTTP 200 with `run_id`, `trace_id`, and `answer.status=completed`, proving the deployed service can make a real request through the configured DeepSeek gateway.
- The public POST SSE endpoint returned `text/event-stream`, began with `run.started`, emitted continuous sequence values 1 through 27, and ended with exactly one `run.completed` terminal event.
- A browser preflight from `https://joker01-01.github.io` returned HTTP 200 and the exact `access-control-allow-origin` value. Runtime logs show normal Uvicorn startup and successful health/invoke/SSE requests with no `agent_runtime_unavailable`, OOM, or restart event.
- After adding the root Docker packaging, `python -m pytest -q` passed all 91 tests, Ruff passed, mypy passed for 41 source files, and `python evals/run.py` passed 24/24 deterministic cases.
- `npm run build` passed. `npm run modelops:data:check` and `npm run test:modelops-data` first hit the documented sandbox-only `tsx` ENOMEM failure, then passed outside the managed sandbox with all 11 focused tests successful.
- Neither Docker nor Podman is installed in the current local environment; Zeabur's remote build, image startup, custom health check, and live API runtime now provide the container verification evidence.
- Phase D implementation commit `ec65297` passed GitHub `Verify pull request` run `33794793373` and `Deploy to GitHub Pages` run `33794793308`. The published HTML and JavaScript returned HTTP 200, the browser DOM contained the API-configured Evidence Console and the existing leaderboard, and the production bundle contained the intended Zeabur origin without private service identifiers or secrets.
- HTTPS transport checks carrying the production Pages `Origin` header covered all three paths. The constrained recommendation emitted 15 monotonically sequenced events and one `run.completed`; exact-version explanation emitted 10 events with an exact resolution and one terminal event; the review-only update emitted 10 events including `proposal.ready` and ended `awaiting_human_review` without a write.
- Rollback commit `2226205` passed GitHub Verify run `33796127335` and Pages run `33796127339`. Zeabur showed that revision as `Running`; 12 consecutive health checks remained HTTP 200 through the switch, and a complete recommendation SSE emitted sequence 1 through 15 with exactly one `run.completed`. Commit `ec65297` changed no files under `backend/`, `Dockerfile`, or `data/modelops/`, so this is deployment-control evidence rather than a behaviorally different backend rollback.
- Recovery commit `bb9e31e` passed GitHub Verify run `33796618760` and Pages run `33796618658`. Zeabur then showed the recovery revision as `Running`; another 12 consecutive health checks remained HTTP 200, the restored Pages HTML/JavaScript returned HTTP 200, and the post-recovery recommendation SSE completed with 27 monotonically sequenced events and one terminal event.
- The post-recovery 12-hour Zeabur Usage graph showed low-single-digit CPU percentages and service memory around 65-75 MB for the single replica. Dedicated-server network metrics were unavailable in that view. This is a bounded control-plane snapshot, not sustained-load evidence or a whole-server capacity measurement.

## Next (separate milestones)

1. Add a network-backed sync freshness gate if external AA/Arena drift must block publication.
2. Design authentication, rate limiting, or quota enforcement before materially broader public API exposure.
3. Add broader leaderboard end-to-end interaction coverage and sustained-load/resource testing if usage justifies them.
