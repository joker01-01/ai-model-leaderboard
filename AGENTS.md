# Project Instructions

## Overview

This repository is an AI model leaderboard being incrementally upgraded toward the ModelOps Agent described in the approved `docs/modelops-agent-plan.md`. Preserve the working leaderboard and its evidence boundaries while making small, reviewable changes.

The ModelOps document is an approved implementation plan, not proof of implemented behavior. Do not describe FastAPI, LangGraph, SSE, Agent tools, backend tests, or evaluation results as existing until repository evidence confirms them.

## Stack and structure

- React 19, TypeScript, and Vite provide the static GitHub Pages frontend.
- `src/data/models.ts` contains curated model metadata.
- `src/data/benchmarks.ts` combines verified static observations with the generated Artificial Analysis snapshot.
- `src/lib/score.ts` and `src/lib/editorial.ts` contain ranking semantics.
- `scripts/sync-data.mjs` performs external-data synchronization and exact-version matching.
- Python 3.12, Pydantic v2, FastAPI, and the low-level LangGraph graph API provide the ModelOps Agent backend under `backend/`.
- `backend/app/repositories/leaderboard.py` strictly loads the committed generated JSON; `backend/app/tools/` contains five typed read-only/pure tools; `backend/app/graph/` contains state, nodes, routes, dependency injection, and tool orchestration.
- `backend/app/services/model_gateway.py` keeps the gateway protocol and deterministic fake; `backend/app/services/openai_gateway.py` implements locally validated OpenAI-compatible Responses structured output with DeepSeek V4 Flash as the default provider model, and `backend/app/services/provider_document_client.py` implements bounded exact-allowlist document fetching.
- `backend/app/main.py` owns FastAPI configuration, lifespan dependencies, and the browser-facing service status page; `backend/app/api/` exposes health, non-streaming invoke, and disconnect-aware POST SSE endpoints. `src/features/agent/` contains the typed SSE client, runtime wire validation, and React evidence-console panel; without `VITE_AGENT_API_URL`, the static leaderboard remains usable and the panel stays disconnected.
- The selected independent backend target is Zeabur on a managed Tencent Cloud Singapore server. The root `Dockerfile` packages `backend/app/` together with `data/modelops/generated/`; Zeabur must build from the repository root with Root Directory left empty.
- `.github/workflows/sync-data.yml` prepares App-signed review PRs; `.github/workflows/auto-merge-data.yml` evaluates successful PR verification from trusted `main` and merges only routine generated-data refreshes; `.github/workflows/deploy.yml` deploys merged `main` to GitHub Pages.

## Verified commands

```powershell
npm ci
npm run dev
npm run build
npm run modelops:data
npm run modelops:data:check
npm run test:data-update-policy
npm run test:modelops-data
npm run test:agent
npm run test:frontend
npm run sync:data
npm run sync:data:check
git diff --check
```

From `backend/`:

```powershell
python -m pip install -e ".[dev]"
python -m pytest -q
python -m ruff check app tests evals
python -m mypy app tests evals
python evals/run.py
```

Local API startup from `backend/` requires an exported key; `.env.example` is documentation and is not loaded automatically:

```powershell
$env:MODELOPS_MODEL_API_KEY = "<DeepSeek API key>"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- `npm run build` is the current TypeScript and production-build gate.
- `npm run test:modelops-data` is the focused shared-data contract and ranking-regression suite. `npm run test:data-update-policy` covers the fail-closed routine-refresh gate. `npm run test:agent` covers the typed SSE parser and Agent Panel interactions; `npm run test:frontend` runs all frontend tests. There is no general frontend lint script yet.
- `npm run modelops:data:check` is offline and must fail when the committed ModelOps JSON is missing or stale.
- `npm run sync:data` requires network access; fresh Artificial Analysis data also requires `AA_API_KEY`.
- `npm run sync:data:check` is currently a dry run only. It does not fail when generated output would change, so do not treat a zero exit code as proof that snapshots are current.
- The backend tests and eval runner are offline. Keep their gateway and provider-document clients deterministic and injected; they must not require model-provider or document-site network access.
- `GET /` is a browser-facing HTML service boundary that mirrors runtime availability and links to the public product, API docs, and health endpoint. `GET /healthz` remains the machine-readable readiness check; both return `503` when runtime configuration or startup dependencies are unavailable. API wire fields are snake_case.
- `POST /api/v1/agent/query` is a one-run SSE stream with monotonic event sequence, one terminal event, heartbeat comments, and disconnect cancellation. It does not provide persistence or replay.

## Product invariants

- Public ranking uses only the same-version Artificial Analysis Intelligence Index.
- Similar names, unknown versions, missing evidence, and multiple matches remain unmatched or ambiguous. Never infer a match from model family or naming similarity.
- Editorial scoring stays separate from public ranking.
- Arena data is reference-only and must not affect public rank.
- Preserve the source URL, observation date, benchmark identity, and concrete model version for published evidence.
- Missing evidence must remain visible; do not replace it with guessed or sibling-version data.
- Reviewed provider evidence must use a registered `(providerId, providerModelId)` pair for the internal model ID. Provider IDs cannot be swapped even when the provider-model string is identical. A missing region is missing evidence, not proof of unavailability.
- Static benchmark versions, AA source slugs, and Arena model names must each match their controlled exact-version registry; display labels are not interchangeable with source identifiers.
- Price selection uses the per-request token interval and stable offer ID. Do not select a tier from monthly aggregate tokens or silently choose the cheapest provider offer.
- Price lookup uses total per-request input (`input + cached input`) for tier selection. The inclusive freshness cutoff is the earlier of `staleAfter` and non-null `validThrough`; cached usage without a cached-input price is missing evidence, not zero-cost usage.
- Backend boundary contracts use strict, immutable Pydantic models with unknown fields rejected. LangGraph state remains a `TypedDict`, and runtime dependencies are supplied through `GraphContext`; do not place clients or repositories in serializable state.
- Recommendation ordering is deterministic: AA Coding descending, then AA Intelligence descending with missing values last, then exact model ID ascending. This Agent ordering must not change the public leaderboard.
- Only missing user-supplied fields route to clarification. Missing, stale, ambiguous, or conflicting evidence produces a completed evidence-bounded answer; unrecoverable internal failures terminate as `failed`.
- Preserve candidate filter reasons and controlled provider deployment-region evidence through the final recommendation. A provider region still does not prove end-user country availability.
- Provider-document search accepts only repository allowlist entries and an injected client; callers cannot supply arbitrary URLs. Returned excerpts must contain every normalized query term in one bounded window before they count as evidence.
- Provider-document redirects must remain inside the exact repository allowlist and preserve the initial `(modelId, providerId, providerModelId, kind)` binding. Cross-binding redirects cannot become evidence.
- Update-proposal citations with provider metadata must supply a complete provider/kind binding and match an exact provider pair registered for the target model.

## Generated data

- Do not hand-edit `src/data/generated/aaSnapshot.ts`, `src/data/generated/arenaSnapshot.ts`, `data/modelops/generated/*.json`, or any future file explicitly marked as generated.
- Change source mappings or generator logic, regenerate, then review the resulting snapshots and `data/sync-report.json`.
- Change ModelOps reviewed inputs or exporter logic, run `npm run modelops:data`, inspect both generated JSON files, then run `npm run test:modelops-data` and `npm run modelops:data:check`.
- Treat `data/sync-report.json` as generated review evidence. Do not hide missing or ambiguous entries.

## Publication boundary

- Scheduled refreshes must prepare or update a pull request; they must not push data changes directly to `main`.
- A data-refresh pull request may auto-merge only after the repository gate proves that changed paths are limited to approved generated data/report files, exact source identities and matched sets remain stable, no new missing/ambiguous/conflicting evidence or loss of previously matched evidence appears, and every required data contract, test, and build check passes.
- Any anomaly, failed or missing required check, or change to code, workflows, dependencies, documentation, or reviewed source mappings remains subject to human approval. Preserve the pull request as the review and audit boundary.
- Do not enable conditional auto-merge until `main` has appropriate rules or protection and the required pull-request checks cannot be bypassed.
- The data-sync GitHub App must be installed only on this repository, hold only Contents and Pull requests write access, sign its refresh commits, and remain outside every required-check bypass list. Automatic merge must revalidate the App author/signature plus immutable PR, head, base, and current-`main` SHAs.
- ModelOps tools remain read-only or pure proposal operations unless an explicitly approved milestone adds writes.
- Zeabur GitHub services redeploy on pushes to their linked branch by default. Keep the backend service linked to `main` so a pull-request merge remains the backend release trigger.

## Risk-proportionate review

These rules apply to every coding model used on this repository, including Sol.

- Match review depth to the trust boundaries touched by the requested change. Do not turn ordinary work into a general security audit.
- Documentation, styling, presentation-only UI, and deterministic pure-function changes normally need focused correctness and regression checks, not a repository-wide security review.
- Do not run broad vulnerability scans, dependency audits, threat-model exercises, or unrelated hardening unless the user requests them or concrete evidence makes them necessary for the task.
- Perform targeted security checks when a change touches authentication or authorization, secrets, untrusted or external input, network requests, dependencies, filesystem or Git writes, GitHub/PR automation, release/deployment, or another trust boundary.
- Limit targeted checks to relevant risks: secret exposure, schema/input validation, source or URL allowlists, unsafe writes, dependency provenance, least-privilege workflow permissions, and approval bypasses.
- Risk proportionality never permits skipping a necessary check, weakening the exact-version policy, or bypassing the controlled publication boundary.

## Change and verification rules

- Read callers, related data, workflows, and existing documentation before changing an interface or behavior.
- Keep diffs narrow. Do not refactor unrelated ranking, data, or UI code while implementing a scoped task.
- Preserve user-authored and uncommitted changes.
- For frontend or TypeScript changes, run `npm run build`.
- For sync changes, run the smallest relevant check, inspect generated diffs, `data/sync-report.json`, and the ModelOps adapter, then run `npm run build`.
- Before delivery, run `git diff --check`, explicitly check untracked files for whitespace, and inspect the final diff for unintended files, secrets, generated-file edits, and publication-boundary changes.
- Report implemented, verified, inferred, and unverified claims separately when the distinction matters.
