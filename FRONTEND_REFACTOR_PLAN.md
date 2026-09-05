# AI Model Leaderboard Full-Product Refactor Plan

> Execution plan for the user-confirmed product direction in `DESIGN.md`. Phases 1–4 are implemented and locally verified on pull request #15. Phase 5 has completed implementation, local verification, and final visual acceptance on its separate branch; Phase 6 protected stacked review and post-merge deployment acceptance remain governed by `PROJECT_STATE.md`.

## 1. Status and implementation boundary

Phase 1 is documentation-only:

- freeze the confirmed product direction and visual design in `DESIGN.md`;
- replace stale Top-20/default-board assumptions in `AGENTS.md`;
- record current versus target state in `PROJECT_STATE.md`;
- define the staged file scope and acceptance gates in this document.

Phase 1 must not change React, CSS, generated data, Python, workflows, dependencies, or deployed behavior. Phase 2 begins only after the user reviews this baseline.

## 2. Verified current baseline

The deployed `main` branch and the confirmed target are different.

Current implementation:

- opens a source-native Artificial Analysis Intelligence board by default;
- publishes the first 20 finite Intelligence rows;
- retains a curated editorial board and a visible Agent evidence console;
- fetches the complete paginated AA response during sync but stores only the 20-row public board plus curated exact-version matches;
- uses a Python FastAPI/LangGraph backend with DeepSeek structured intent extraction and allowlisted provider-document fetching;
- prepares App-signed data pull requests and auto-merges only the current narrow routine-refresh class.

Current working tree:

- contains uncommitted frontend edits from the superseded default-board direction;
- contains no implementation of the confirmed four-card home, full AA metrics, simplified advisor, or new footer;
- must be reconciled file by file when implementation begins, without discarding unrelated user work.

The existing curated catalog, exact-version evidence, editorial scoring, update-proposal path, and provider evidence rules remain valid internal capabilities. They are not the data source for the new public AA pages.

## 3. Confirmed product decisions

### 3.1 Public navigation

- Home is a directory headed `AI 模型排行榜`, not a leaderboard.
- Home contains exactly four cards: `模型能力榜单`, `模型速度榜单`, `模型价格榜单`, and `按需求选模型`.
- Hash routes provide direct links and GitHub Pages refresh compatibility.
- The curated editorial board has no entry in the new public navigation, but its code and backend support are not deleted during the initial refactor.

### 3.2 Public rankings

- Ability metrics are AA Intelligence, Coding, and Agentic.
- Efficiency metrics are AA first-answer latency, output tokens per second, input price, and output price.
- Home previews Intelligence, first-answer latency, and output price as three independent single-bar charts. Full efficiency rows show one model identity followed by two same-direction bars stacked vertically under blue/amber metric-sort controls.
- Each view includes every source row with the finite values required by that view.
- Source configurations remain separate and are keyed by `sourceId`; no family merge, public-page pagination, or fixed Top-20 limit is allowed. The sync job still validates and consumes every upstream API page.
- Ability scores sort high to low.
- Speed defaults to first-answer latency low to high; its full view can select latency or throughput and toggle direction.
- Price defaults to output price high to low; its full view can select input or output price and toggle direction.
- Equal primary values sort by the deterministic name sort key from `DESIGN.md`, then `sourceId` ascending; competition rank uses only the primary metric.
- Competition ranks are computed before creator filtering.
- Public charts convey rank through order and do not render visible rank numerals; competition-rank semantics remain available to assistive technology.
- Missing values are omitted from the affected view and never converted to zero.

### 3.3 Model presentation

- Nullable raw AA name/source slug and exact source ID remain stored; neither a missing name nor a missing slug removes a finite-metric row.
- A deterministic display-only formatter removes configuration noise and a leading `Claude` brand token, while retaining meaningful effort labels such as Max, XHigh, High, and Medium. Trailing configuration groups use half-width parentheses for optical right alignment. Reasoning mode appears only when needed to distinguish a collision, abbreviated as `R` / `NR` and merged into an effort group as `High·R` / `High·NR`.
- Chart names remain on one line with an ellipsis at the available boundary; hover exposes the complete simplified label while raw names remain preserved as evidence.
- Display labels never participate in identity, matching, deduplication, or source validation.
- Major creators use local licensed icons; unknown creators use a stable initial fallback.

### 3.4 Advisor

- The public advisor is a one-shot form and result, not a chat or trace console.
- DeepSeek may extract intent from arbitrary requirements.
- Deterministic code selects five candidates from the full AA snapshot.
- DeepSeek server-side web search may supplement only those five candidates using official creator sources, official GitHub organizations, and AA.
- AA remains authoritative for score and order; web results cannot rewrite AA metrics.
- The default priority is capability fit, then budget constraint, then lower output price, then higher output speed. Explicit user priorities override it.
- The response presents one recommendation and two collapsed alternatives.
- If model or search access fails, the deterministic AA result remains available and is labelled `实时资料未完成核验`.
- Public protection is per-IP 5 advisor requests per 10 minutes and at most 2 simultaneous web-backed recommendations across the service.

### 3.5 Footer and publication

- Footer content is limited to GitHub, Bilibili, WeChat official account, source attribution, and the AA observation date; the earlier `WS` wordmark is omitted.
- The WeChat QR image is bundled locally and shown as an image-only popover on pointer hover or keyboard focus.
- The user reports that the required AA redistribution permission has been obtained. Keep attribution and do not store contract or credential material.
- Scheduled refreshes continue through pull requests. After one human-reviewed full-data baseline, normal model additions/removals and metric value/date/order changes may auto-merge; structural anomalies remain open for review.

## 4. Target architecture

```text
Artificial Analysis API ───────────────┐
                                       v
                              scripts/sync-data.mjs
                               │                 │
                               │ all modes       │ default scheduled mode only
                               v                 v
                    scripts/aa-public-      legacy AA + Arena +
                    snapshot.mjs            curated ModelOps refresh
                      - pagination                 │
                      - normalization              v
                               │          editorial board / legacy Agent
                               v
                    full public AA snapshot
                      - frontend ranking pages
                      - deterministic shortlist
                               │
                     ┌─────────┴─────────┐
                     v                   v
             GitHub Pages frontend   FastAPI advisor
             Home / rankings         strict request / top 5 /
             / Advisor form          official search / fallback

Arena source is contacted only by the default scheduled mode.
`--aa-public-only` follows only the left public-snapshot path.
```

The public source-native AA domain and curated exact-version ModelOps domain do not share row identity, membership, or ranking semantics. The default scheduled sync may refresh both domains in one workflow, but Phase 2 also introduces an isolated `--aa-public-only` mode so the first full public baseline can be generated and reviewed without running Arena, rewriting the legacy curated snapshot/report, or changing ModelOps evidence.

## 5. Full AA data contract

The generator should emit one normalized source-native collection rather than duplicate five independently maintained boards.

```ts
interface AaPublicSnapshot {
  schemaVersion: number
  source: {
    url: string
    observedAt: string
    schemaFingerprint: string
    intelligenceIndexVersion: number
    pagination: {
      pageSize: number
      totalPages: number
      declaredTotalRows: number | null
      fetchedRowCount: number
    }
  }
  models: readonly AaPublicModel[]
}

interface AaPublicModel {
  sourceId: string
  sourceSlug: string | null
  rawName: string | null
  creatorId: string | null
  creatorName: string | null
  releaseDate: string | null
  observedAt: string
  intelligence: number | null
  coding: number | null
  agentic: number | null
  inputPricePerMillion: number | null
  outputPricePerMillion: number | null
  timeToFirstAnswerSeconds: number | null
  outputTokensPerSecond: number | null
}
```

Contract rules:

- reject duplicate or empty `sourceId`;
- reject non-finite numbers;
- require prices, first-answer time, and output speed to be non-negative while preserving genuine zero;
- validate ability indices against the observed AA contract instead of guessing a range;
- require one consistent observation date, a positive finite Intelligence Index version, and a stable fingerprint of the selected Free v2 wire-contract projection; AA Coding and Agentic are derived and do not receive invented version fields;
- accept only the documented `free`, `pro`, and `commercial` caller tiers, require the tier to remain stable across pages, and omit it from the normalized snapshot because `/language/models/free` keeps the same Free response shape for all three key tiers;
- validate complete pagination before replacing the committed snapshot;
- normalize surrounding whitespace on nullable raw names, source slugs, and creator text at the external boundary, convert blank results to null, and preserve the remaining content for deterministic display and filtering;
- never drop a finite-metric row because its name or slug is missing; record that condition in the public sync report and use the transparent display/sort fallback from `DESIGN.md`;
- sort the generated storage form deterministically by identity, then sort per metric in pure selectors;
- keep the existing curated `models` exact-match map logically separate;
- serialize both the TypeScript snapshot and backend JSON from the same validated in-memory object;
- assert semantic equivalence between those two public outputs in tests;
- keep the existing legacy generated module and parser adapter unchanged so the old deployed UI still builds during the additive migration.

The exact field names must be confirmed against the current AA response before implementation. No unavailable metric may be invented from a nearby AA field.

Phase 2 uses separate generated modules instead of overloading the legacy `models` property:

```ts
// src/data/generated/aaPublicSnapshot.ts
export const AA_PUBLIC_SNAPSHOT: AaPublicSnapshot // every source-native row

// src/data/generated/aaSnapshot.ts, unchanged in AA-public-only mode
export const AA_SNAPSHOT: LegacyAaSnapshot // current Top-20 compatibility data + curated exact matches
```

`AA_SNAPSHOT.models` continues to mean the curated exact-match map, and its existing `intelligenceLeaderboard` field remains the old UI compatibility source. Phase 3 switches public consumers to the separate `AA_PUBLIC_SNAPSHOT`; it does not delete or reinterpret `AA_SNAPSHOT.models`. Removing the unused 20-row compatibility field is a later generator cleanup, not part of the UI migration.

`node scripts/sync-data.mjs --aa-public-only` fetches AA and writes only `src/data/generated/aaPublicSnapshot.ts`, `data/aa/generated/snapshot.json`, and `data/aa/generated/sync-report.json`. It must not run Arena, read curated aliases as an input requirement, write `src/data/generated/aaSnapshot.ts`, write `src/data/generated/arenaSnapshot.ts`, write `data/sync-report.json`, or regenerate `data/modelops/generated/*`. The same mode with `--check` performs the public diff check without writing. The existing default `npm run sync:data` retains its current full scheduled behavior and additionally produces the three public outputs from the same complete AA response.

## 6. File-level change scope

### 6.1 Documentation in Phase 1

| File | Change |
| --- | --- |
| `DESIGN.md` | Confirmed information architecture, visual system, interactions, accessibility, and exclusions |
| `FRONTEND_REFACTOR_PLAN.md` | Staged implementation, file scope, risks, and acceptance gates |
| `AGENTS.md` | Durable product, data, publication, and review rules |
| `PROJECT_STATE.md` | Current implementation, confirmed target, gaps, and next phase |

### 6.2 Data and sync in Phase 2

Modify:

- `package.json`, adding the new public-data Node tests to the existing data-policy test command without adding a dependency
- `scripts/sync-data.mjs`
- `scripts/data-update-policy.mjs`
- `scripts/data-update-policy.test.mjs`
- `.github/workflows/sync-data.yml`
- `.github/workflows/auto-merge-data.yml`

Add:

- `scripts/aa-public-snapshot.mjs`
- `scripts/aa-public-snapshot.test.mjs`
- `scripts/generated-snapshot-module.mjs`, the canonical legacy TypeScript renderer shared by sync and trusted auto-merge parsing
- `scripts/sync-data.public.test.mjs`, a sandboxed positive and missing-key write-boundary integration test
- `scripts/fixtures/aa-language-models-pages.json`, a sanitized multi-page response fixture containing no credential or private agreement data
- `src/lib/aaPublicSnapshot.ts`
- `src/lib/aaPublicSnapshot.test.ts`
- `src/lib/aaRankings.ts`
- `src/lib/aaRankings.test.ts`

Generator-owned outputs:

- `src/data/generated/aaPublicSnapshot.ts`
- `data/aa/generated/snapshot.json`, the canonical backend-readable full AA snapshot
- `data/aa/generated/sync-report.json`, the public pagination/schema/coverage/name-quality review report

Legacy `src/data/generated/aaSnapshot.ts`, `src/data/generated/arenaSnapshot.ts`, `data/sync-report.json`, and `data/modelops/generated/*` are explicitly outside the AA-public-only write set. Runtime dependencies remain unchanged; `package.json` changes only to include the new Node test in `npm run test:data-update-policy`.

### 6.3 Home and leaderboard frontend in Phase 3

Modify:

- `src/App.tsx`
- `src/App.test.tsx`
- `src/styles.css`
- `index.html`

Add:

- `src/lib/hashRoute.ts`
- `src/lib/hashRoute.test.ts`
- `src/lib/modelPresentation.ts`
- `src/lib/modelPresentation.test.ts`
- `src/hooks/useChartAnimation.ts`
- `src/hooks/useChartAnimation.test.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/HomePage.test.tsx`
- `src/pages/AbilityPage.tsx`
- `src/pages/AbilityPage.test.tsx`
- `src/pages/EfficiencyPage.tsx`
- `src/pages/EfficiencyPage.test.tsx`
- `src/pages/AdvisorPage.tsx`, initially a simple disabled form shell marked as not yet connected
- `src/components/LeaderboardLayout.tsx`
- `src/components/LeaderboardLayout.test.tsx`
- `src/components/SingleMetricChart.tsx`
- `src/components/SingleMetricChart.test.tsx`
- `src/components/DualMetricChart.tsx`
- `src/components/DualMetricChart.test.tsx`
- `src/components/ModelIdentity.tsx`
- `src/components/CreatorIcon.tsx`
- `src/components/CreatorIcon.test.tsx`

Retire after all call sites migrate and after reconciling their current uncommitted diffs:

- `src/components/AaBoard.tsx`
- `src/components/AaBoard.test.tsx`
- `src/lib/aaLeaderboard.ts`
- `src/lib/aaLeaderboard.test.ts`

Phase 3 stops public code from reading the old `intelligenceLeaderboard` field but keeps the generated compatibility field and curated `AA_SNAPSHOT.models` intact. It does not expose the legacy evidence console at `#/advisor`.

### 6.4 Advisor frontend and backend in Phase 4

Frontend modify:

- `src/pages/AdvisorPage.tsx`
- `src/App.test.tsx`
- `src/styles.css`

Frontend add:

- `src/features/advisor/AdvisorForm.tsx`
- `src/features/advisor/AdvisorForm.test.tsx`
- `src/features/advisor/api.ts`
- `src/features/advisor/api.test.ts`
- `src/features/advisor/types.ts`
- `src/features/advisor/types.test.ts`

Keep every file under `src/features/agent/` unchanged for the legacy evidence-console path.

Backend modify:

- `.env.example`
- `backend/app/config.py`
- `backend/app/main.py`
- `backend/app/api/__init__.py`
- `backend/app/api/contracts.py`
- `backend/tests/integration/test_api.py`
- `backend/evals/run.py`
- `Dockerfile`, to copy `data/aa/generated/snapshot.json` and the reviewed official-source registry

Backend/data add:

- `data/aa/official-sources.json`, binding reviewed `creatorId` values to accepted official domains and GitHub organizations
- `data/aa/official-sources.schema.json`
- `data/aa/README.md`, documenting generated versus reviewed inputs
- `backend/app/api/advisor.py`
- `backend/app/api/advisor_contracts.py`
- `backend/app/domain/advisor.py`
- `backend/app/repositories/aa_snapshot.py`
- `backend/app/repositories/official_sources.py`
- `backend/app/services/advisor_gateway.py`, the injected protocol and deterministic fake
- `backend/app/services/deepseek_advisor_gateway.py`, using DeepSeek Responses intent output and built-in `web_search`
- `backend/app/services/advisor_selector.py`
- `backend/app/services/advisor_rate_limit.py`
- `backend/tests/unit/test_aa_snapshot_repository.py`
- `backend/tests/unit/test_official_sources.py`
- `backend/tests/unit/test_advisor_selector.py`
- `backend/tests/unit/test_deepseek_advisor_gateway.py`
- `backend/tests/unit/test_advisor_rate_limit.py`
- `backend/tests/integration/test_advisor_api.py`
- `backend/evals/advisor_cases.jsonl`

The new public endpoint is non-streaming JSON `POST /api/v1/advisor/recommend`; it does not enter the existing LangGraph/SSE route. Existing provider-document, graph, tool, and review-only proposal code remains unless a later separately reviewed cleanup proves it unused. Registry changes are reviewed-input changes and cannot auto-merge as routine data.

### 6.5 Footer and assets in Phase 5

Modify:

- `src/pages/HomePage.tsx`
- `src/App.test.tsx`
- `src/styles.css`

Add:

- `src/components/SiteFooter.tsx`
- `src/components/SiteFooter.test.tsx`
- `src/assets/wechat-qrcode.jpg`, copied from `D:\qrcode1788526628636.jpg`
- `src/assets/brands/openai.svg`
- `src/assets/brands/claude.svg`
- `src/assets/brands/gemini.svg`
- `src/assets/brands/deepseek.svg`
- `src/assets/brands/grok.svg`
- `src/assets/brands/glm.svg`
- `src/assets/brands/kimi.svg`
- `src/assets/brands/qwen.svg`
- `src/assets/brands/meta.svg`
- `src/assets/brands/github.svg`
- `src/assets/brands/bilibili.svg`
- `src/assets/brands/wechat.svg`
- `src/assets/ATTRIBUTION.md`, recording each third-party asset source and license

### 6.6 Documentation updated after behavior exists

- `README.md`
- `docs/data-refresh-automation.md`
- `docs/backend-deployment-zeabur.md`

These must describe verified behavior only and therefore are not rewritten in Phase 1.

### 6.7 Explicitly preserved initially

- `src/data/models.ts`
- `src/data/benchmarks.ts`
- `src/lib/score.ts`
- `src/lib/editorial.ts`
- `src/components/Board.tsx`
- `src/components/Radar.tsx`
- `data/modelops/`
- current legacy Agent tools and review-only proposal logic

Removing those areas is not required to launch the new public information architecture.

## 7. Implementation stages

### Phase 1 — Documentation baseline

Scope:

- complete only the four files in section 6.1;
- distinguish current production facts from target design;
- record all frozen decisions and stage gates.

Verification:

- Markdown and terminology consistency review;
- `git diff --check`;
- explicit trailing-whitespace scan including untracked documents;
- final diff and untracked-file review.

Stop gate: user reviews the four documents before Phase 2.

### Phase 2 — Full source-native AA data

Scope:

- inspect the live/current AA payload fields for all seven metrics;
- normalize and validate the complete paginated model collection through the new isolated public normalizer;
- add `--aa-public-only` generation/check behavior whose write set is limited to the three new public generated artifacts;
- keep public and curated generated domains separate; the default scheduled sync may produce both, but the public-only baseline cannot run Arena or rewrite legacy/ModelOps outputs;
- provide pure selectors for each board, competition rank, and creator filters;
- generate the TypeScript and backend JSON public snapshots from one validated object and compare them semantically;
- keep the old 20-row generated module/parser unchanged as an additive compatibility layer; Phase 3 stops consuming its public adapter without deleting the curated legacy snapshot;
- update routine/anomaly data policy for the new human-reviewed baseline.

Focused acceptance:

- every row satisfying a selected view's required finite metrics is available;
- a row with a valid `sourceId` and finite selected metric is retained even when its raw name or slug is absent; the public report records the missing field and display uses the deterministic fallback;
- duplicate IDs, malformed values, incomplete pagination, schema/index changes, and catastrophic row loss fail closed;
- the first PR introducing `AA_PUBLIC_SNAPSHOT` never auto-merges and establishes the reviewed full-data baseline;
- later percentage gates run only when current `main` has the same public schema version;
- compare `fetchedRowCount` and seven independent finite-value row counts, not percentage fields or speed/price view intersections; keep `declaredTotalRows` null for schema version 1 and require a reviewed schema change before adopting any future upstream total-row field;
- for every base count above zero, block when `headCount < baseCount * 0.8`; an exact 20% decrease is allowed, while a greater decrease is not;
- when a base metric count is zero, skip only that percentage calculation and still enforce schema, pagination, type, and value validation;
- model add/remove and ordinary metric value/date/order changes are allowed only after the initial full-data baseline is accepted;
- curated exact-version matched/unmatched sets and generated ModelOps evidence cannot change accidentally;
- the AA-public-only command leaves every legacy AA, Arena, combined sync-report, and ModelOps generated artifact byte-for-byte unchanged;
- generated output is deterministic.
- public-only invocation without `AA_API_KEY` fails before any write; default scheduled invocation without the key preserves all three committed public artifacts unchanged while retaining its documented legacy skip behavior.

Verification:

- focused generator/parser/policy tests;
- `npm run test:data-update-policy`;
- `npm run test:frontend`;
- `npm run test:modelops-data`;
- `npm run modelops:data:check`;
- `npm run build`;
- generated diff plus `data/aa/generated/sync-report.json` inspection, followed by a legacy-output no-change check.

Stop gate: review the first full snapshot and its policy report before UI work.

### Phase 3 — Home and leaderboard pages

Scope:

- reconcile, rather than blindly overwrite, the existing uncommitted frontend edits;
- implement dependency-free hash routing;
- build the four-card home;
- implement all ability, speed, and price views;
- implement simplified names, creator identity/initial fallback, filtering, competition-rank semantics without visible rank numerals, responsive layout, and chart-level animation;
- provide `#/advisor` as a simple disabled form shell with clear next-phase copy; do not expose the legacy technical Agent console.

Focused acceptance:

- all routes deep-link, refresh, and navigate correctly;
- every detail header centers its title while the back control remains pinned left; ability, speed, and price omit header descriptions, and source/date attribution stays in the home footer;
- home previews use real current data and remain static; on desktop the ability preview uses a responsive linear ceiling that aligns its leading visible fill with the leading price fill without filling either plot, while stacked ability previews and every full ability page use the absolute 0–100 scale; speed uses inverse first-answer-latency bars with a readable ceiling above the slowest displayed top-five value, and price uses a readable ceiling above the observed output-price maximum;
- desktop home gives ability a full-width row, places the speed and price single-bar previews in one common-edge two-column row, and gives the advisor a full-width row; mobile stacks all four cards in reading order;
- the advisor destination keeps its minimal copy while presenting `开始选择` as a prominent purple 20–24px action with a matching 42px arrow;
- the full-width ability plot aligns from the left speed-plot baseline through the right price-plot boundary; its leading visible fill additionally ends on the leading visible price fill, and shared preview identity and value columns prevent the three charts from drifting apart;
- speed and price open as independent detail pages with their own titles and no internal cross-leaderboard switch; each full efficiency row renders its model identity once and places the two same-direction metric bars in a vertical stack to its right under blue/amber metric-sort controls with the specified opposing half-arrow glyph;
- detail pages omit search, result-count summaries, and the `更多` creator menu; the nine fixed creator filters use 2px outlines, preserve global ranks, and do not replay animation; home-preview and full-ability model names use the exact creator-tone palette without recoloring their bars;
- ability metric tabs and every page's creator pills are centered; efficiency pages have no metric tabs; fixed creator pills use distinct exact-ID colors, and full model-name text uses the matching color while ability, speed, and price bars retain their metric colors;
- full leaderboard rows have no horizontal divider lines;
- full chart names and values use 15px type and names stay bounded in one right-aligned identity column; values follow their actual bar endpoints, full bars use 18px with square-left/rounded-right fills, no dark remainder track, and an 8px value gap; ability uses 44px desktop rows and the fixed `0 / 25 / 50 / 75 / 100` source-scale grid, while two-bar efficiency rows use deterministic readable ceilings strictly above both observed maxima, five solid guides labelled with compact blue/amber real-scale value pairs, and the smallest non-overlapping compact rhythm; every full chart makes the leftmost zero-origin guide 2px and higher-contrast than the remaining 1px guides, while home previews omit guides;
- ability tabs replay about 600 ms of chart-level animation only when the selected metric changes; entering either independent efficiency page plays its initial animation, while creator and efficiency-sort changes do not replay it;
- all-zero price, output-speed, or ability domains render the defined 2% stubs without `NaN` or division by zero;
- reduced-motion users see final values immediately;
- 390 px and 200% zoom have no page-level horizontal overflow;
- no Top-20 limit or model-family merge returns.

Verification:

- focused selector, route, formatter, chart, and interaction tests;
- `npm run test:frontend`;
- `npm run build`;
- browser checks at the target desktop/tablet/mobile sizes.

Stop gate: user visually accepts the home cards and ranking pages before advisor work. This checkpoint explicitly excludes a working advisor and the Phase 5 footer/assets.

### Phase 4 — One-shot advisor and official web verification

Scope:

- define strict one-shot advisor API contracts;
- parse intent with DeepSeek;
- select five candidates deterministically from full AA data;
- invoke DeepSeek Responses built-in server-side `web_search` through an injected adapter for only those candidates;
- validate citations against the reviewed `creatorId` source registry;
- preserve AA order, remove only officially contradicted hard-constraint candidates, and return the first three survivors as one recommendation plus up to two alternatives;
- add deterministic AA fallback, per-IP request limiting, and global concurrency limiting;
- connect the disabled `#/advisor` shell to the simple form/result while preserving the unexposed legacy evidence-console files and backend abilities.

Focused acceptance:

- no key or raw provider response reaches the client or repository;
- the idle advisor form omits the header description, field-helper paragraphs, and service-connection status copy while retaining labels, placeholders, validation errors, disabled state, and result feedback;
- the strict model-produced need contract contains only ordered ability enums, one promoted objective, and the reviewed hard-requirement enums from `DESIGN.md`; validated request fields separately own region, budget, and token values, and model output cannot provide candidate IDs or URLs;
- arbitrary user text/model output cannot choose URLs, expand the five-row pool, or override AA scores/order;
- only registry-bound official creator domains, registry-bound official GitHub organizations, and AA can produce live evidence; search summaries alone do not;
- registry loading rejects duplicate creators, unknown fields, non-ASCII registered hosts, non-HTTPS/default-port citation URLs, invalid GitHub organization prefixes, and redirects that leave the same creator binding;
- an unregistered creator remains rankable from AA but cannot receive fully verified status;
- budget eligibility uses the exact monthly-cost formula in `DESIGN.md`, and missing required prices exclude the row;
- all network operations have finite time and response bounds;
- malformed model/search output is rejected locally;
- six requests from one IP within the window return 429 for the sixth with `Retry-After`;
- when two web searches are already active, a third valid request skips search and returns HTTP 200 deterministic AA fallback;
- DeepSeek/search failure also returns HTTP 200 deterministic AA fallback with the unverified label;
- Zeabur remains one replica with one Uvicorn worker; any scale-out is rejected until a shared limiter replaces the in-process service-wide gate;
- JSON client cancellation aborts the request; the unchanged legacy SSE endpoint retains its existing disconnect and terminal-event contracts.

Verification:

- offline fake-gateway and fake-search tests;
- repository and API integration tests;
- Ruff, mypy, pytest, and deterministic evals;
- `npm run test:frontend`;
- `npm run build`;
- one deliberately bounded live provider smoke only after local tests pass and without logging secrets or bodies.

Stop gate: user accepts the public recommendation result and fallback wording.

### Phase 5 — Footer, assets, and responsive polish

Scope:

- add the final social footer;
- bundle the WeChat QR locally;
- complete icon licensing notes, image-only QR hover/focus behavior, and responsive polish;
- remove only superseded public UI code proven unreachable.

Focused acceptance:

- exact GitHub and Bilibili links are correct;
- `WS` is absent;
- hovering or keyboard-focusing the WeChat control reveals only the QR image, without visible account or scan-instruction copy;
- footer date comes from `observedAt`;
- unknown creators remain visible;
- a creator without a bespoke SVG uses the initial fallback, including after an automatically merged data update;
- no remote font, logo, or QR dependency is introduced.

Verification:

- focused component tests;
- keyboard and screen-size browser checks;
- `npm run test:frontend`;
- `npm run build`.

Stop gate: final visual review completed on 2026-09-05.

### Phase 6 — Full verification, documentation, and publication

Scope:

- update README and operational docs to verified reality;
- run the complete repository gates;
- inspect generated data, assets, secrets, and workflow permissions;
- publish through the protected pull-request path;
- verify GitHub Pages and Zeabur after merge.

Verification:

```powershell
npm run test:data-update-policy
npm run modelops:data
npm run modelops:data:check
npm run test:modelops-data
npm run test:agent
npm run test:frontend
npm run build

Set-Location backend
python -m pytest -q
python -m ruff check app tests evals
python -m mypy app tests evals
python evals/run.py
Set-Location ..

git diff --check
```

Publication acceptance:

- required GitHub checks pass for the exact head SHA;
- no secret, private AA agreement, generated-file hand edit, or unrelated working-tree change is included;
- GitHub Pages serves all hash routes;
- Zeabur health is ready and the advisor succeeds in both verified and forced-fallback tests;
- the deployed service still reports one replica/one worker for the in-process quota contract;
- the scheduled refresh subsequently proves one normal full-data update can auto-merge while an injected anomaly remains open.

## 8. Cross-phase acceptance criteria

### Functional

- Home shows only the confirmed directory experience and footer.
- All five ranking views use seven validated AA metrics: three ability indices, two speed metrics, and two price metrics. Each full efficiency row presents its two metrics as same-direction vertically stacked bars with one model identity.
- Ability, price, and speed pages retain exact values, units, global competition-rank semantics, and source identity without rendering rank numerals.
- Advisor returns deterministic usable output with or without live verification.

### Data integrity

- Public display labels never alter source identity.
- Public full-data membership never expands the curated catalog.
- Missing evidence stays missing.
- Data updates remain reproducible and reviewable.

### Accessibility and performance

- Keyboard, focus, semantic selected state, readable numeric alternatives, reduced motion, and QR popover behavior are complete.
- A full leaderboard does not create one animation loop per row.
- Mobile has no document-level horizontal overflow.

### Operational

- Keys exist only in server/repository secret stores.
- Public advisor limits are deterministic and tested.
- Normal data refreshes can update without routine human work; structural changes fail closed.
- Documentation never claims an unverified or merely planned feature is live.

## 9. Primary risks and controls

| Risk | Control |
| --- | --- |
| AA field names or units differ from assumptions | Inspect and fixture the actual response before freezing the contract |
| Full snapshot accidentally mutates curated ModelOps evidence | Separate types, outputs, selectors, and regression tests |
| Simplified labels collapse distinct configurations | Keep `sourceId` identity and collision tests |
| Hundreds of animated rows cause jank | One chart-level progress value and reduced-motion bypass |
| Price log bars mislead | Exact linear values plus visible log-scale label |
| Web search introduces unsupported claims | Five-candidate limit, official-domain validation, bounded excerpts, strict output schema |
| Public API spends unbounded provider quota | Per-IP window, global concurrency gate, timeouts, and AA fallback |
| Routine automation accepts structural breakage | Complete-pagination/schema/identity/drop checks and protected PR merge |
| Superseded uncommitted UI work is lost | Reconcile each touched file and review the final diff |
| Docs drift ahead of code | Keep current/target status explicit and update public docs only after verification |

## 10. Phase 2 entry gate

Before any implementation:

1. The user reviews `DESIGN.md`, this plan, `AGENTS.md`, and `PROJECT_STATE.md`.
2. The working-tree frontend edits are treated as preserved input, not a clean baseline to discard.
3. Phase 2 is limited to the new public data contract, isolated/full sync integration, selectors, policy, workflows, and the three new generated outputs; it does not start the visual refactor or rewrite legacy generated artifacts through the public-only mode.
4. The first full AA snapshot is a human-reviewed baseline.
5. After Phase 1 acceptance, Phase 2 may perform the controlled AA fetch required to inspect and generate the full snapshot using the existing secret; it must not print or persist that secret.
6. A live DeepSeek/search smoke waits until Phase 4 offline tests pass. Commit, push, and deployment remain outside Phases 2–5 unless separately approved and belong to Phase 6 by default.
