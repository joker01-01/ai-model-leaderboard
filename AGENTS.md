# Project Instructions

## Overview

This repository is an AI model leaderboard with a React/Vite frontend and FastAPI/LangGraph backend. The user-confirmed product direction is defined in `DESIGN.md`. Superseded implementation plans have been removed; use Git history for historical decisions, not as new phase gates on maintenance of the published product.

The design describes intended behavior, not proof that it exists. Use `PROJECT_STATE.md`, the current code, generated data, tests, and deployed revision before claiming a phase is implemented or published.

Preserve the working product and its evidence boundaries through small, phase-scoped changes. Do not start a later phase while an earlier phase is awaiting user review.

## Current stack and structure

- React 19, TypeScript, and Vite provide the GitHub Pages frontend.
- The public AA path uses `src/pages/`, `src/lib/aaRankings.ts`, `src/lib/aaPublicSnapshot.ts`, and generated `src/data/generated/aaPublicSnapshot.ts`. `src/lib/aaLeaderboard.ts`, `src/components/AaBoard.tsx`, and `src/data/generated/aaSnapshot.ts` are preserved legacy consumers.
- `src/data/models.ts`, `src/data/benchmarks.ts`, `src/lib/score.ts`, and `src/lib/editorial.ts` implement the separate curated editorial/ModelOps domain.
- `scripts/sync-data.mjs` owns external synchronization. `scripts/aa-public-snapshot.mjs` validates and normalizes the full Free v2 AA projection; `scripts/generated-snapshot-module.mjs` is the canonical legacy TypeScript renderer used by sync and trusted auto-merge parsing. `src/lib/aaPublicSnapshot.ts` and `src/lib/aaRankings.ts` provide the strict frontend contract and pure selectors. The first credentialed 643-row generated baseline was explicitly approved on 2026-09-04.
- The local public frontend uses `src/lib/hashRoute.ts`, `src/lib/modelPresentation.ts`, `src/pages/`, and the public chart components for the four-card home, five complete leaderboard views, and the one-shot `#/advisor` experience. `src/features/advisor/` owns the strict client contract, form, request lifecycle, and result presentation.
- Python 3.12, Pydantic v2, FastAPI, and the low-level LangGraph graph API provide the backend under `backend/`.
- `backend/app/repositories/leaderboard.py` loads committed generated ModelOps JSON. `backend/app/tools/` contains typed read-only/pure tools. `backend/app/graph/` owns state, nodes, routes, dependency injection, and orchestration.
- `backend/app/services/openai_gateway.py` provides locally validated DeepSeek Responses structured output. `provider_document_client.py` provides bounded exact-allowlist fetching for the legacy evidence flow. The independent advisor path uses `deepseek_advisor_gateway.py`, a deterministic AA selector, a reviewed official-source registry, and bounded in-process rate/concurrency controls.
- `backend/app/main.py` owns configuration/lifespan and the service status page. `backend/app/api/` exposes health, the one-shot advisor JSON endpoint, legacy non-streaming invoke, and disconnect-aware POST SSE endpoints.
- The backend deploys to Zeabur from repository-root `Dockerfile`; it must include both Python code and required generated JSON. The service remains linked to `main`.
- GitHub workflows prepare App-signed data PRs, evaluate routine data updates from trusted `main`, verify pull requests, and deploy merged `main` to GitHub Pages.

The public ranking pages and the deterministic advisor selector consume separate strict projections of the full source-native AA snapshot. Both remain independent from curated exact-version ModelOps data; the advisor never projects curated metadata into public candidates.

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

Local API startup can serve deterministic AA-only advisor fallback without a provider key. Live DeepSeek verification and the legacy Agent require an exported key; `.env.example` is documentation and is not loaded automatically:

```powershell
$env:MODELOPS_MODEL_API_KEY = "<DeepSeek API key>"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- `npm run build` is the TypeScript and production frontend gate.
- `npm run sync:data` requires network access and fresh AA data requires `AA_API_KEY`.
- `npm run sync:data:check` is dry-run-only and does not prove the committed snapshot is current.
- `npm run modelops:data:check` is offline and must fail when generated ModelOps JSON is missing or stale.
- Backend tests and evaluations must remain deterministic and injected; ordinary verification must not require provider or document-site network access.
- `GET /` is the browser status boundary and `GET /healthz` is the machine readiness check. Both return 503 when required startup/runtime dependencies are unavailable. Browser/API wire fields remain snake_case.
- `POST /api/v1/agent/query` currently provides one-run SSE with monotonic sequence, one terminal event, heartbeat comments, and disconnect cancellation. It has no persistence or replay.
- `POST /api/v1/advisor/recommend` provides one-shot JSON. It rate-limits each client IP to five requests per ten minutes and admits at most two live web-backed recommendations in one process; capacity or provider failure returns deterministic AA fallback instead of queueing.

## Confirmed public-product invariants

- Phone layout (up to 620 CSS pixels) must keep one home leaderboard per row in ability, speed, price, advisor order. Fit a 760px single-column canvas proportionally to the available viewport width, excluding any scrollbar. Model identities stay beside their bars. Never scale the desktop two-column home onto phones. Keep tablet reflow and normal desktop layout; native pinch zoom remains available.

- Home is a four-card directory headed `AI 模型排行榜`; it does not open a leaderboard by default.
- The cards are `模型能力榜单`, `模型速度榜单`, `模型价格榜单`, and `按需求选模型`. Use the exact hash routes defined in `DESIGN.md`.
- The home directory uses an up-to-approximately-1480px centered canvas and one shared square-edged grid. On desktop, ability spans the first row, speed and price form a common-edge two-column second row, and the advisor spans the final row; mobile stacks all four cards in that order. Do not separate them into floating rounded cards or add decorative header chrome.
- Home card headings use natural Chinese character spacing and deliberate vertical breathing room. The advisor card's `开始选择` action is a prominent purple 20–24px label paired with a 42px purple arrow. Public chart identities place the creator icon after the model name and align the identity directly beside its bar. On desktop, the full-width ability plot shares its left baseline with the speed plot and its right boundary with the price plot; the leading visible ability fill must also end on the leading visible price fill endpoint. Home preview fills are vivid same-family gradients at 20px, square on the left and semicircular on the right. Single-metric charts have no dark remainder track, and each value follows the actual fill endpoint with an 8px gap. The shared directory outline/dividers remain clearly visible against black.
- Ability views directly use AA Intelligence, Coding, and Agentic metrics.
- Efficiency views use AA first-answer time plus output speed, and input price plus output price. Each model identity appears once per row; its two bars share a left origin and stack vertically to the right under a blue/amber pair of metric-sort controls.
- Speed and price are independent detail pages with the titles `模型速度榜单` and `模型价格榜单`; do not add an internal speed/price switch. Only the ability detail page exposes metric tabs.
- A full view contains every AA source row with the finite values required for that view. Do not impose a Top-20 limit, paginate the public page, infer missing values, or merge model-family/configuration rows. The sync job must consume and validate every upstream API page.
- `sourceId` is the public row identity. Raw AA name/source metadata remains stored; simplified labels are display-only.
- Compute metric order and competition rank before creator filtering, but do not render rank numerals in public charts. Preserve competition-rank semantics for ties and assistive text.
- Ability sorts high to low. Speed defaults to first-answer latency low to high, and price defaults to output price high to low. On a full efficiency page, either metric legend button selects that metric for ordering; clicking the active metric toggles direction. First-answer latency initially selects low to high, while output speed and both price metrics initially select high to low. Recompute competition rank from the active metric before creator filtering; home previews keep their fixed first-answer-latency and output-price defaults.
- Equal primary values use the deterministic name sort key from `DESIGN.md`, then `sourceId` ascending for stable display; those tie-breakers do not alter the competition rank.
- Missing values stay missing and are omitted from the affected chart. A genuine numeric zero remains valid.
- Raw AA name and source slug may be absent. Keep any row with a valid `sourceId` and required finite metric, report missing identity text, and use `rawName ?? sourceSlug ?? "未命名模型 " + sourceId` as the transparent display/sort base. Never guess a name or drop the row.
- Public display labels remove a leading `Claude` brand token; exact creator IDs use the matching local product marks: Claude for Anthropic, Gemini for Google, Grok for xAI, GLM for Z AI, Kimi for Kimi, Qwen for Alibaba, and Meta for Meta. OpenAI and DeepSeek retain their provider marks. Logo lookup must not inherit JavaScript prototype keys; every unmapped creator ID uses the visible initial fallback. When needed for collision disambiguation, reasoning modes render as `R` / `NR` and merge with an effort label as `High·R` / `High·NR`. Chart names remain single-line ellipsized with the complete simplified label available on hover. Raw names remain unchanged for evidence.
- Public rankings never project curated metadata into an AA row and never expand the curated catalog.
- Phone home ranking previews contain three deterministically ordered rows; tablet/desktop previews contain five. Ties do not expand previews. Detail rankings remain complete on all devices.
- All three home ranking previews use the same single-bar grammar. On desktop, the cyan Intelligence preview uses a home-only responsive linear scale so its leading fill ends exactly with the leading amber price fill while retaining visible headroom; lower ability rows remain proportional to their exact scores. At 1024px and below, the stacked ability preview returns to the absolute 0–100 scale. Speed previews first-answer latency from fast to slow as a lower-is-better inverse blue bar against a deterministic readable ceiling strictly above the slowest displayed top-five value; price previews output price in amber against a readable ceiling above the observed maximum. A first-ranked observed value must not define or fill a preview endpoint. Full ability pages always retain the absolute 0–100 scale, and full efficiency routes show both metrics as two same-direction vertically stacked bars, not as two copies of the model identity.
- Home previews, first detail entry, and changes to ability metric, creator filter, efficiency metric or sort direction play a 600ms chart-growth animation even when the OS requests reduced motion, as explicitly chosen for this product. Animate entry-viewport bars with Web Animations transforms and one RAF per chart for visible number text; never rerender the full React ranking or change layout widths each frame. Offscreen rows and unsupported-animation browsers show final values. Unrelated rerenders and clicking an already selected control without changing state do not replay it. Home endpoint alignment must measure the final untransformed fill width.
- The public navigation does not expose the curated editorial board or technical Agent console. Preserve those implementations until a scoped cleanup proves they can be removed.
- Detail headers center their titles, with the back control pinned left. Ability, speed, and price omit header descriptions. Detail pages omit search, result-count summaries, and repeated source/date lines; attribution and update date stay in the home footer.
- Ability metric tabs and the nine visible creator-filter pills (`全部`, OpenAI, Anthropic, Google, DeepSeek, xAI, GLM, KIMI, Qwen) are centered. Do not add a `更多` creator menu. Creator-pill borders are 2px, and each fixed creator pill has a distinct exact-ID-derived border color. Null and unregistered model names use the fallback pink tone even though no fallback filter is exposed. Model-name text uses the matching creator tone on the home previews and all full views; bars and creator icons do not inherit it. Ability bars remain cyan, while speed and price bars retain their fixed blue/amber metric colors.
- Full leaderboard rows use whitespace rather than horizontal row divider lines.
- Full ability names and values use 15px type. Names are bounded in one fixed right-aligned identity column before the icon, and overflow ellipsizes within that column. Trailing configuration groups use half-width parentheses so visible text edges align with names that have no qualifier. Ability indexes use a fixed `0 / 25 / 50 / 75 / 100` scale: a score such as `65.7` fills exactly 65.7% of the plot. Exact values follow their animated bar endpoints with an 8px gap. Ability bars use an 18px height, a square left edge, a rounded right edge, and 44px desktop rows.
- Full speed and price views reuse that 15px fixed right-aligned identity treatment. Their two 18px bars have transparent remainder space, square left edges, rounded right edges, and exact values 8px after each animated endpoint; keep the two-bar row compact without overlap. Each metric uses a deterministic readable ceiling strictly above its observed maximum. Use five solid vertical guides labelled as compact color-matched `blue value / amber value` pairs from those scales; do not reuse the ability page's 0–100 labels. Each metric-sort button ends with the same 16px glyph: two complete vertical strokes, with only the outer-left half of the upward arrowhead on the left stroke and only the outer-right half of the downward arrowhead on the right stroke. The current direction alone is emphasized.
- In every full public chart, the leftmost zero-origin vertical guide is 2px and visibly higher-contrast than the remaining 1px guides. Home previews continue to omit vertical guides.
- During iterative UI tuning, use focused component/browser checks for each small adjustment and defer the full frontend test/build suite until the current group of visual changes is complete.
- The footer appears on home only and contains only the specified GitHub/Bilibili/WeChat controls, AA attribution, and the AA observation date; do not render a `WS` wordmark. Hovering the WeChat control or focusing it with the keyboard reveals only the locally bundled QR image in a non-modal popover; do not render visible account, scan-instruction, dialog, or native-tooltip copy. Locally bundled third-party icon licenses must ship in the production artifact through `public/THIRD_PARTY_NOTICES.txt`.

## Advisor invariants

- The public advisor is one-shot and has no account, conversation history, database, or visible graph/tool trace.
- The idle advisor page keeps copy minimal: retain the `MODEL ADVISOR` kicker, title, field labels, placeholders, budget toggle copy, validation errors, and result states, but omit the header description, requirement/deployment helper paragraphs, and service-connection status copy.
- DeepSeek may extract a strict intent/constraint contract but does not choose or rank arbitrary models.
- Its output is limited to ordered ability enums, one promoted objective, and reviewed hard-requirement enums; deployment region/budget/token values come from validated form fields. Reject model-provided URLs, candidate/provider IDs, unknown fields, and unsupported enums.
- Deterministic code selects a five-row verification pool from the validated full AA snapshot using the eligibility, monthly-cost, priority, missing-value, and tie-break rules in `DESIGN.md`.
- AA remains authoritative for ability, price, speed, and ordering. Live search can supplement or validate only the selected five.
- DeepSeek Responses built-in `web_search` is accessed through an injected server-side adapter. It accepts evidence only from a reviewed `creatorId` registry of official site/docs/pricing domains, official GitHub organizations, and AA. User input, model output, summaries without accepted citations, or redirects cannot introduce evidence URLs.
- Search preserves AA-derived order. It may eliminate a row only when accepted official evidence explicitly contradicts a hard constraint; missing region evidence remains unverified rather than unsupported. Return the first three survivors as one recommendation plus up to two alternatives.
- An unregistered creator remains eligible from AA data but cannot receive the fully verified status.
- Deployment-region text is a verification requirement, not proof of availability.
- Missing required evidence cannot be described as a complete or budget-compatible match.
- The response must distinguish fully verified, partially verified, and AA-only fallback states. Provider/search failure still returns the deterministic AA result.
- The public boundary is the non-streaming JSON `POST /api/v1/advisor/recommend`, per-IP 5 advisor requests per 10 minutes, and at most 2 simultaneous web-backed recommendations service-wide. Use a trusted proxy configuration before accepting forwarded client IP headers.
- The sixth request returns 429 with `Retry-After`. When web capacity is occupied or the provider fails, return HTTP 200 deterministic AA fallback rather than queueing indefinitely. Client cancellation must abort the JSON request.
- Keep Zeabur at one replica and one Uvicorn worker while the limiter is in process. Horizontal or multi-worker scaling requires a reviewed shared limiter first.
- Provider keys remain server-side environment variables. Never place them in generated data, client bundles, logs, tests, docs, or commits.

## Curated ModelOps invariants

- The editorial board and legacy Agent use the curated exact-version catalog, not public source-family inference.
- Similar names, unknown versions, missing evidence, and multiple matches remain unmatched or ambiguous.
- Static benchmark versions, AA slugs, Arena names, and `(providerId, providerModelId)` pairs each use their controlled exact identifiers. Display labels are not identifiers.
- Arena data remains reference-only and does not affect public AA rank.
- Preserve source URL, observation date, benchmark identity, concrete model version, and visible missing evidence.
- Price selection uses per-request token intervals and stable offer IDs. Total request input is input plus cached input. Never infer a tier from monthly aggregate usage or silently choose the cheapest offer.
- The inclusive freshness cutoff is the earlier of `staleAfter` and non-null `validThrough`. Missing cached-input price remains missing rather than zero.
- Provider deployment region is positive evidence for one offer, not proof of end-user country support. Absence is missing evidence.
- Reviewed prices use an exact 30-calendar-day review window.
- Strict immutable Pydantic boundary models reject unknown fields. LangGraph state remains a `TypedDict`; runtime clients/repositories belong in immutable context, not serializable state.
- The current legacy recommendation order—AA Coding descending, AA Intelligence descending with missing last, then exact model ID—applies only to the existing legacy Agent path until the confirmed advisor selector replaces that public experience.
- Only missing user-fillable inputs route to clarification. Evidence gaps produce a bounded completed answer; unrecoverable internal failures terminate as failed.
- Preserve candidate filter reasons and controlled provider-region evidence through the legacy final recommendation.
- Provider-document excerpts count only when every normalized query term occurs in one bounded window.
- Provider-document redirects must remain in the exact allowlist and preserve the initial model/provider/provider-model/kind binding.
- Update-proposal citations with provider metadata must provide a complete provider/kind binding and match an exact registered provider pair for the target model.
- `prepare_data_update` remains pure and review-only unless a separately approved milestone adds writes.

## Generated data

- Never hand-edit `src/data/generated/aaPublicSnapshot.ts`, `data/aa/generated/snapshot.json`, `data/aa/generated/sync-report.json`, `src/data/generated/aaSnapshot.ts`, `src/data/generated/arenaSnapshot.ts`, `data/modelops/generated/*.json`, `data/sync-report.json`, or any future generated file.
- The full public AA collection and existing curated exact-match map are separate consumers. Public membership must not mutate curated matches or ModelOps evidence.
- Generated modules are distinct: `src/data/generated/aaPublicSnapshot.ts` exports full source-native `AA_PUBLIC_SNAPSHOT`, while legacy `src/data/generated/aaSnapshot.ts` exports `AA_SNAPSHOT` and its curated exact-match `models` map. Never reinterpret or overwrite the legacy `models` property.
- `scripts/sync-data.mjs --aa-public-only` may write only the public TypeScript snapshot, public backend JSON, and public sync report. It must not run Arena or rewrite the legacy AA snapshot, legacy Arena snapshot, combined sync report, or ModelOps generated data. Default scheduled sync may refresh both domains in its existing reviewed workflow.
- Public-only sync without `AA_API_KEY` must fail before writing. Default scheduled sync without the key must preserve all three committed public artifacts and keep its documented legacy AA-skip behavior.
- The `/language/models/free` endpoint accepts Free, Pro, or Commercial keys while retaining the Free response shape. Accept only those three `tier` values, require one stable tier across all pages, and do not store the caller's subscription tier in the public snapshot.
- The public snapshot records schema version, source URL, observation date, a fingerprint of the selected Free v2 wire-contract projection, the positive finite AA Intelligence Index version, complete-pagination proof, and normalized model rows. Coding and Agentic are derived indices and have no invented version fields. Its TypeScript and backend JSON forms come from one validated object and must be semantically equal.
- At the external AA boundary, trim optional name/slug/creator text and convert a blank result to `null`; never trim or infer the required `sourceId`. Generated snapshots and downstream parsers continue to accept only canonical `null` or non-empty trimmed optional text.
- Public price/latency/speed values are nullable, finite, and non-negative; zero remains valid. Ability indices must satisfy the inspected AA contract.
- `data/aa/official-sources.json` is a reviewed input, not generated data. Changes to creator/domain/GitHub bindings require human review.
- Change public mappings or generator logic, regenerate, inspect all generated diffs and `data/aa/generated/sync-report.json`, and prove the public-only mode left legacy artifacts unchanged before running the relevant contract tests.
- Change reviewed ModelOps inputs/exporter logic, run `npm run modelops:data`, inspect generated JSON, then run `npm run test:modelops-data` and `npm run modelops:data:check`.
- Treat both public `data/aa/generated/sync-report.json` and legacy `data/sync-report.json` as review evidence for their respective domains. Do not hide missing, ambiguous, conflicting, malformed, or dropped data.

## Data publication boundary

- Scheduled refreshes prepare or update a pull request; they never push generated changes directly to `main`.
- The first full source-native AA snapshot is human reviewed.
- After that baseline, ordinary model additions/removals and metric value/date/order changes may auto-merge only when changed paths are generated-data/report allowlisted, pagination and contracts are complete, IDs are unique, structural/index assumptions are stable, curated exact matches/evidence do not regress, and every required check passes.
- Percentage gates run only against current `main` with the same public schema. Compare fetched total rows and each of the seven finite-value row counts independently. The current Free v2 API has no declared total-row field; schema version 1 keeps that value null and proves completeness from pagination. Any future upstream total-row field requires a reviewed schema change before use. For a nonzero base, `headCount < baseCount * 0.8` requires human review; a zero base skips only that comparison.
- Duplicate IDs, incomplete pagination, schema/index/methodology changes, a greater-than-20% gated drop, new malformed/conflicting evidence, generated-policy failure, or non-generated changes require human review.
- Code, workflow, dependency, documentation, source-mapping, and reviewed-input changes never use the routine data auto-merge path.
- Trusted auto-merge parsing must compare every allowlisted generated TypeScript module against its canonical full-file renderer after CRLF-to-LF normalization; parsing only the exported JSON initializer is insufficient because executable prefix/suffix code must be rejected.
- Preserve protected `main`, required checks, immutable head/base/current-main SHA validation, App author/signature validation, and least-privilege App permissions. The App stays outside bypass lists.
- Zeabur remains linked to `main`, so a protected merge is the backend release trigger.

## Risk-proportionate review

- Match review depth to the trust boundary touched. Documentation, styling, presentation-only UI, and deterministic pure functions normally need focused correctness/regression checks, not a repository-wide security audit.
- Do not run broad vulnerability scans, dependency audits, or unrelated threat-model/hardening work unless the user requests it or concrete evidence requires it.
- For advisor/network work, target only relevant risks: server-side key handling, strict schemas, prompt/tool output validation, official-domain allowlists, redirect binding, timeouts, response bounds, proxy/IP trust, rate/concurrency limits, and safe fallback.
- For sync/GitHub work, target only relevant risks: source validation, safe generated writes, changed-path controls, least-privilege permissions, provenance, immutable SHAs, and approval bypasses.
- Proportional review never permits weakening exact-version rules, hiding missing evidence, or bypassing protected publication.

## Change and verification rules

- Read callers, related tests, generated-data contracts, workflows, `DESIGN.md`, and `PROJECT_STATE.md` before changing behavior.
- Work one approved phase at a time and stop at its review gate.
- Keep diffs narrow; preserve user-authored and uncommitted work, including superseded changes, until reconciled deliberately.
- Do not add React Router, chart, animation, state-management, UI-framework, or remote-font dependencies for the confirmed frontend.
- For frontend/TypeScript changes, run focused tests and `npm run build`.
- For sync changes, inspect generated diffs and the applicable public/legacy sync reports, verify public-only write isolation, run focused policy/data checks, and run `npm run build`.
- For backend changes, run focused pytest first, then full pytest, Ruff, mypy, and deterministic evals as appropriate.
- Before delivery, run `git diff --check`, scan tracked and untracked changed files for trailing whitespace and secrets, and inspect the final diff for unrelated changes or generated-file hand edits.
- Update `PROJECT_STATE.md` after meaningful state changes. Update README/operational docs only after behavior is implemented and verified.
- Report implemented, verified, inferred, and unverified claims separately whenever the distinction matters.
