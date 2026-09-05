# Project State

## Goal

Refactor the existing AI model leaderboard into the simple four-card product defined in `DESIGN.md`, backed by complete source-native Artificial Analysis metrics and a one-shot DeepSeek-assisted model advisor, while preserving the curated exact-version ModelOps domain and protected data-publication workflow.

## Current repository baseline

- Working directory for the Phase 4 task: `C:\Users\ADMIN\.codex\worktrees\d8e0\ai-model-leaderboard` (physical alias `D:\CodexData\.codex\worktrees\d8e0\ai-model-leaderboard`).
- The task worktree is on `codex/phase-4-advisor`. Pull request [#15](https://github.com/joker01-01/ai-model-leaderboard/pull/15) contains the Phase 1–4 work and incorporates `origin/main` revision `cdb94b63d2dedbd2d8328bbc7290a47fa118bc8c` through merge commit `9cb152b`.
- React 19, TypeScript, and Vite build the GitHub Pages frontend.
- The published public board currently opens directly and renders the first 20 finite AA Intelligence entries from a complete paginated fetch.
- The deployed frontend still contains the curated editorial board and technical Agent evidence console. The local Phase 1–4 working tree replaces their public entry points with the confirmed four-card directory and one-shot advisor while preserving the legacy implementations.
- The local full public snapshot contains 643 source-native rows; the separate legacy generated AA module still keeps its 20-row Intelligence compatibility board and curated exact-match `models` map.
- The curated editorial and ModelOps paths use exact internal IDs, controlled AA/Arena/provider identifiers, reviewed evidence, deterministic export, and visible missing evidence.
- The pre-refactor Python 3.12 FastAPI/LangGraph backend is deployed from `origin/main` to Zeabur at `https://modelops-agent-api.zeabur.app`.
- The local backend preserves the strict legacy invoke/SSE path and adds the independent one-shot advisor JSON path, deterministic full-AA selection, reviewed official-source validation, bounded DeepSeek Responses web verification, and in-process rate/concurrency gates.
- GitHub Actions verifies pull requests, deploys Pages, prepares App-signed data PRs, and conditionally auto-merges the current narrow class of routine generated refreshes.

The deployment statements above describe `origin/main`. Phases 1–4 are committed on the pull-request branch but are not merged or published; the footer/social assets remain Phase 5.

## Confirmed product target

The product direction and Phase 1 design baseline are confirmed.

### Public information architecture

- Home title: `AI 模型排行榜`.
- Four cards only:
  - `模型能力榜单`
  - `模型速度榜单`
  - `模型价格榜单`
  - `按需求选模型`
- Hash routes:
  - `#/`
  - `#/ability/intelligence`
  - `#/ability/coding`
  - `#/ability/agentic`
  - `#/efficiency/speed`
  - `#/efficiency/price`
  - `#/advisor`
- The curated board and technical Agent console remain in the repository but have no new public navigation entry.

### Public data

- One validated full source-native AA record per `sourceId`.
- The snapshot records its schema, exact source, observation date, selected Free v2 wire-contract projection fingerprint, AA Intelligence Index version, and complete-pagination proof; Coding/Agentic have no invented independent version. New `src/data/generated/aaPublicSnapshot.ts` and `data/aa/generated/snapshot.json` serialize the same validated object, with review evidence in `data/aa/generated/sync-report.json`.
- The new public module exports `AA_PUBLIC_SNAPSHOT`; the Phase 3 working-tree UI consumes it directly. Existing `src/data/generated/aaSnapshot.ts` continues to export the legacy `AA_SNAPSHOT.models` curated exact matches and old 20-row compatibility field for preserved legacy consumers and the currently deployed pre-refactor revision.
- Metrics: Intelligence, Coding, Agentic, input price, output price, first-answer time, and output tokens per second.
- Each leaderboard includes all rows with its required finite values; no Top-20 cap, family merge, or public-page pagination. Sync still validates every upstream API page.
- Ability sorts high to low. Speed defaults to output speed high to low and price defaults to output price high to low; full efficiency pages let either displayed metric become the active sort and toggle its direction while recomputing global competition rank before creator filtering.
- Equal primary values sort by the deterministic name sort key, then `sourceId`; competition rank uses the primary value only.
- Creator filtering preserves pre-filter global competition rank, while public charts communicate rank by order and omit visible rank numerals.
- Simplified names are display-only and remove a leading `Claude` brand token. Collision-only reasoning qualifiers use `R` / `NR` and merge with effort as forms such as `High·R`; chart names use a single-line ellipsis with the full simplified label on hover. Nullable raw names/slugs and exact `sourceId` identity remain stored. Missing name/slug never drops a finite-metric row and uses the transparent fallback defined in `DESIGN.md`.
- Public full-data membership remains independent from the curated exact-version catalog.

### Public advisor

- One-shot free-text form with optional region and progressive budget inputs.
- The idle advisor presentation retains its kicker, title, labels, placeholders, validation errors, budget toggle copy, and result states while omitting the header description, requirement/deployment helper paragraphs, and service-connection status copy.
- DeepSeek extracts a strict intent contract.
- Deterministic code selects five candidates from the full AA snapshot.
- DeepSeek Responses built-in server-side web search verifies only those candidates against a reviewed creator-to-official-source registry.
- AA-derived order remains fixed; official contradictions may remove a hard-constraint mismatch, then the first three survivors become one recommendation and up to two alternatives.
- Result: one recommendation, two collapsed alternatives, relevant AA metrics, concise reason, collapsed sources, and an explicit verified/partial/AA-only state.
- DeepSeek/search failure returns the deterministic AA result instead of an empty response.
- Target transport: non-streaming JSON `POST /api/v1/advisor/recommend`.
- Public controls: 5 advisor requests per IP per 10 minutes and at most 2 simultaneous web-backed recommendations across the one-replica/one-worker service. IP excess returns 429; web-capacity or provider failure returns deterministic AA fallback.

### Presentation

- Black canvas, thin rules, system fonts, no decorative marketing hero or glass-card wall.
- Home uses a centered up-to-approximately-1480px data canvas with one shared square-edged grid: ability spans the first row, speed and price share the second row, and the advisor spans the final row. Mobile stacks all four cards in that order.
- Home uses cyan Intelligence bars, blue output-speed bars, amber output-price bars, and a purple advisor accent. Full efficiency rows use blue/amber metric-sort controls and two same-direction vertically stacked bars to the right of one model identity.
- Home previews show exactly five real rows and remain static. On desktop, ability uses a responsive linear preview ceiling that aligns its leading visible fill with the leading price fill while retaining headroom; at stacked widths and on every full ability page, ability uses the absolute 0–100 scale. Speed and price use deterministic readable ceilings above their observed maxima.
- Detail entry and ability-metric switches replay one chart-level 600ms count/bar animation; creator filtering and active-tab clicks do not. Ability, speed, and price detail titles reuse their matching home-card accent colors.
- Detail headers center their titles while keeping the back control left. Ability retains its metric description; speed and price omit header descriptions. Detail pages omit search, result summaries, and repeated source/date lines.
- Only the ability page has internal metric tabs. Speed and price are independent detail pages with separate titles and no cross-leaderboard switch. Ability tabs and the nine fixed creator controls are centered. The creator controls use 2px distinct exact-ID borders and expose no `更多` menu; home-preview and every full-chart model name use the corresponding creator color, unregistered names use the fallback pink tone, ability bars remain cyan, and speed/price bars keep blue/amber metric colors. Full leaderboard rows have no horizontal dividers.
- Full ability names and values use 15px type. Names are bounded and right-aligned before their icons; ability scores use a fixed 0-100 scale, so each bar endpoint matches its displayed score and the exact value follows with an 8px gap. Full ability bars use 18px height in 44px desktop rows and home previews use 20px; both are square-left/rounded-right, omit the dark remainder track, and place values 8px after the fill endpoint.
- Full speed and price names and values also use 15px type. Names use the same fixed right-aligned identity column; both 18px metric bars omit the dark remainder track, end in a right semicircle, and place each value 8px after its own endpoint. Their two-bar rows use a compact non-overlapping rhythm, deterministic readable ceilings strictly above the observed maxima, and five solid guides labelled with compact blue/amber real-scale value pairs.
- Every full public chart renders its leftmost zero-origin guide at 2px with higher contrast than the remaining 1px guides; home previews continue to omit vertical guides.
- The advisor home card contains only `按需求选模型` and the `开始选择 →` action; its former explanatory kicker is intentionally omitted, while the action uses a prominent purple 20–24px label and 42px arrow.
- Footer appears on home only: `WS`, GitHub, Bilibili, WeChat account `23号切片`, AA attribution, and AA observation date.
- The supplied WeChat QR will be copied from `D:\qrcode1788526628636.jpg` into a local frontend asset during the asset phase.

## Phase status

### Existing ModelOps milestones

- Phases A–D of the earlier ModelOps plan are implemented and previously verified: reviewed generated data, strict backend contracts/tools/graph, FastAPI/DeepSeek transport, and the current frontend evidence console.
- Zeabur repository-root packaging, health endpoint, GitHub integration, Pages deployment, and guarded data refresh flow have prior live acceptance evidence.
- Those milestones are preserved; they do not prove the new product refactor.

### New full-product refactor

1. **Documentation baseline — approved and maintained in the working tree.**
   - `DESIGN.md`
   - `FRONTEND_REFACTOR_PLAN.md`
   - `AGENTS.md`
   - `PROJECT_STATE.md`
2. **Full AA data layer — implementation, credentialed baseline generation, local verification, and explicit human baseline approval complete.**
   - strict full Free v2 normalization and review report;
   - isolated `--aa-public-only` generation/check mode;
   - strict frontend parser and five pure ranking selectors;
   - first-baseline/manual-review and later routine-refresh policy gates;
   - sync and auto-merge workflow integration;
   - first full Free v2 baseline: 643 unique source rows across four complete pages, observed 2026-09-04.
3. **Four-card home and ranking pages — implementation, automated/browser verification, and renewed user visual acceptance complete.**
   - dependency-free hash routes for home, three ability views, two efficiency views, and the advisor shell;
   - confirmed home target: a full-width ability card, common-edge speed and price cards, and a full-width advisor card, with three static real-data five-row single-bar previews;
   - confirmed full-efficiency target: one model identity per row, blue/amber metric-sort controls, and two same-direction metric bars stacked vertically to its right;
   - complete 630/255/197/332/440-row leaderboard views;
   - deterministic simplified names without a redundant leading `Claude` token, compact collision-only `R` / `NR` mode markers, global creator-ID filters, non-visible competition-rank semantics, and responsive single-bar/stacked-pair charts;
   - one chart-level 600ms detail animation with reduced-motion support;
   - legacy editorial board and technical Agent console preserved in the repository but removed from public navigation.
4. **One-shot advisor and official web verification — implementation and offline/local-browser verification complete; the user authorized commit, push, and pull-request review.**
   - strict one-shot form and JSON contracts with explicit verified, partial, AA-only, and all-live-candidates-rejected states;
   - deterministic five-row selection from the full backend AA snapshot, including exact monthly-budget filtering and stable AA-derived order;
   - bounded DeepSeek Responses intent extraction and built-in web-search verification against a reviewed creator/source registry;
   - official citation, redirect, candidate-identity, source-kind, and evidence-closure validation before any live claim or hard-constraint elimination;
   - per-IP five-per-ten-minute limiting and a non-queueing two-slot live-web gate for the fixed one-worker/one-replica deployment model;
   - deterministic AA fallback on missing key, provider failure, web saturation, or rejected provider evidence, with cancellation cleanup.
5. **Footer and social assets — not started; ranking-page responsive layout is complete.**
6. **Full verification, documentation, and publication — Phase 1–4 are documented, committed, pushed, and open in pull request #15; merge and publication are not performed.**

Phase 4 is committed on `codex/phase-4-advisor`. Pull request #15 is the review boundary; it has not been merged or deployed.

## Frozen decisions

- Extend this repository; do not replace it with a generic Agent starter.
- Use AA source-native rows directly for public rankings and recommendation candidates.
- Keep public rows keyed by `sourceId`; separate reasoning/effort configurations remain separate.
- Keep curated exact-version evidence and editorial scoring as an independent internal domain.
- Use a dependency-free hash router and code-native bars; add no router, chart, motion, UI, state, or remote-font dependency.
- Use the deterministic display-name collision rules in `DESIGN.md`.
- Use output price high-to-low on the public price leaderboard even though the advisor normally prefers lower price.
- Use AA for score/order and live search only for current official supplemental evidence.
- No public accounts, persistence, conversation history, or visible trace console.
- The user reports that the necessary AA redistribution authorization has been obtained; preserve attribution and store no private agreement material.
- After one human-reviewed full-data baseline, ordinary generated model additions/removals and metric value/date/order changes may auto-merge. Structural anomalies remain review-gated.
- Review depth stays proportional: focused correctness for docs/UI/pure selectors; targeted boundary checks for provider keys, untrusted input, web search, rate limits, GitHub automation, and deployment.

## Phase 1–3 checkpoint contents

At the Phase 1 checkpoint, the following files contained pre-existing changes from the superseded default-board frontend direction:

- `index.html`
- `src/App.test.tsx`
- `src/App.tsx`
- `src/components/AaBoard.tsx`
- `src/components/Board.tsx`
- `src/styles.css`

Phase 3 reconciled `index.html`, `src/App.tsx`, `src/App.test.tsx`, and `src/styles.css` into the confirmed public shell. It preserved the pre-existing `AaBoard.tsx` and `Board.tsx` implementation changes; those files remain in the repository but are no longer imported by the public App.

Phase 1 updates `AGENTS.md` and `PROJECT_STATE.md`, and adds `DESIGN.md` and `FRONTEND_REFACTOR_PLAN.md`.

Phase 2 adds or modifies:

- `scripts/aa-public-snapshot.mjs`, `scripts/generated-snapshot-module.mjs`, and their contract coverage;
- `scripts/sync-data.mjs` and `scripts/sync-data.public.test.mjs`;
- `src/lib/aaPublicSnapshot.ts`, `src/lib/aaRankings.ts`, and their tests;
- `scripts/data-update-policy.mjs` and its tests;
- `.github/workflows/sync-data.yml`, `.github/workflows/auto-merge-data.yml`, and the aggregate test command in `package.json`.
- generated `src/data/generated/aaPublicSnapshot.ts`, `data/aa/generated/snapshot.json`, and `data/aa/generated/sync-report.json` from one credentialed public-only run.

The credential was supplied through a masked local prompt, used only in the sync subprocess, and cleared from that process after completion. It was not printed or written into the repository.

Phase 3 adds or modifies:

- `src/App.tsx`, `src/App.test.tsx`, `index.html`, and scoped public styles in `src/styles.css`;
- `src/lib/hashRoute.ts`, `src/lib/modelPresentation.ts`, and their tests;
- `src/hooks/useChartProgress.ts` and its test;
- `src/pages/HomePage.tsx`, `AbilityPage.tsx`, `EfficiencyPage.tsx`, `AdvisorPage.tsx`, and page tests;
- `src/components/LeaderboardLayout.tsx`, `SingleMetricChart.tsx`, `DualMetricChart.tsx`, `ModelIdentity.tsx`, `CreatorIcon.tsx`, and component tests.

Phase 4 adds or modifies:

- `src/features/advisor/` plus `src/pages/AdvisorPage.tsx`, the home advisor entry, route coverage, and scoped advisor styles;
- `backend/app/domain/advisor.py`, the strict advisor API contracts and endpoint, and independent advisor runtime wiring;
- `backend/app/repositories/aa_snapshot.py` and `official_sources.py` for strict committed-AA loading and reviewed source binding;
- `backend/app/services/advisor_selector.py`, `advisor_rate_limit.py`, `advisor_gateway.py`, and `deepseek_advisor_gateway.py`;
- `data/aa/official-sources.json`, its schema, and the registry review README;
- focused backend/frontend tests, deterministic advisor evaluations, deployment packaging, and configuration documentation.

## Remaining after the Phase 1–4 working tree

- Creator identities currently use stable circular initials. Licensed local brand SVGs, the home-only social footer, and the WeChat QR dialog remain Phase 5 work.
- Phase 5 remains a separate scope; the current pull request intentionally stops after Phase 4.
- A bounded legacy DeepSeek smoke against the current pre-refactor Zeabur deployment returned a schema-valid `completed` answer on 2026-09-05, proving that the existing service-level `MODELOPS_MODEL_API_KEY` remained usable without exposing its value. The Phase 4 advisor's live web-verification path remains unverified until this pull request is merged and Zeabur redeploys it.
- The local machine has no Docker command, so the repository-root image was not built; only packaging contracts were checked statically and through tests.
- Before Zeabur publication, verify one replica/one worker and configure the exact `MODELOPS_TRUSTED_PROXY_CIDRS`; forwarded client IPs remain intentionally untrusted by default.
- README and remaining operational docs should be refreshed in Phase 6 while explicitly distinguishing pull-request code from the deployed `origin/main` revision.
- A single-process in-memory limiter is adequate only while Zeabur runs one worker/replica; horizontal scaling would require a shared limiter before being enabled.

## Verification record

Phase 4 verification in this task worktree:

- full backend pytest: 196/196 passing across advisor and preserved legacy paths;
- Ruff passes for `app`, `tests`, and `evals`; mypy passes across 57 source files;
- deterministic evaluations: 29/29 passing, including five advisor fallback/selection cases;
- `npm run test:frontend`: 162/162 passing across 24 files, including strict advisor request/response parsing, form behavior, cancellation, fallback, live-rejection evidence, and preserved ranking/legacy regressions;
- `npm run build`: TypeScript and Vite production build passing; Vite emits a non-failing 503.35 kB main-chunk size advisory against its 500 kB warning threshold;
- local browser acceptance at desktop and 390px widths exercised the real Vite-to-FastAPI CORS/POST path without a provider key: HTTP 200 returned three deterministic AA-only candidates, explicit live-verification fallback wording, and no page-level horizontal overflow or browser-console error;
- targeted regressions cover sixth-request 429/`Retry-After`, two-slot non-queueing web capacity, disconnect/outer cancellation, lifespan startup cancellation, bounded responses/time/output tokens, strict aliases, exact Decimal cost at JS-safe and subnormal-float boundaries, candidate/source-kind/URL citation binding, redirect binding, all-five live exclusion evidence closure, and future GitHub registry mislabeling;
- `npm run test:data-update-policy`: 38/38 passing; `npm run test:modelops-data`: 12/12 passing; `npm run modelops:data:check`: current, confirming the independent curated ModelOps data remains intact;
- the current pre-refactor Zeabur service passed a bounded live DeepSeek invoke after pull-request creation; the Phase 4 advisor live wire shape, Docker image build, Zeabur proxy/replica configuration, Pages, and Zeabur publication still require their own evidence. Exact-head pull-request checks are external GitHub state and are not frozen in this file.

Current consolidated frontend verification after the readable-axis and visible-fill alignment corrections:

- `npm run test:frontend`: 176/176 passing across 24 files, including two-metric bidirectional sorting, exact-ID creator filtering, responsive leading-fill alignment, strict headroom above observed maxima, inverse TTFA alignment, paired real-value ticks, all-zero finite-axis handling, routing, filtering, responsive chart contracts, and preserved legacy frontend regressions;
- `npm run build`: TypeScript and Vite production build passing;
- focused browser checks after the latest home correction confirm the leading visible ability and price fills differ by less than `0.001px` on the two-column layout while retaining an 8px value gap and visible headroom; at 1024px and 390px the stacked ability preview returns to 65.7% of its absolute 0–100 scale, with no horizontal overflow;
- `npm run test:data-update-policy`: 38/38 passing;
- `npm run modelops:data:check`: current;
- the live 643-row presentation index produces 643 unique display labels with no collision, including the required `Fable 5.1 (Max)` form without the redundant leading `Claude` token; trailing configuration groups use half-width punctuation so visible name endings align optically;
- browser verification rendered exactly 630 Intelligence, 255 Coding, 197 Agentic, 332 Speed, and 440 Price rows with no search control, result summary, repeated source/date line, page-level horizontal overflow, or row divider;
- all eight fixed creator IDs matched their home-preview and full-ability model-name colors to their 2px filter borders, unregistered names retained the fallback pink tone without exposing a fallback filter, every ability bar remained cyan, and speed/price bars retained only the fixed blue/amber metric gradients;
- focused browser verification confirms that the full ability page still renders `65.7` at exactly 65.7% of the fixed 0-100 scale with its value 8px beyond the endpoint; the nine fixed creator controls render with declared 2px borders on all three detail pages, no `更多` control remains, and GLM/KIMI/Qwen select 22/11/88 Intelligence rows with matching row tones and no page-level horizontal overflow;
- the full ability chart rendered 15px names and values, 18px bars, 44px desktop rows, `0 / 25 / 50 / 75 / 100` labels with aligned vertical guides, and square-left/rounded-right fills; sampled desktop and narrow rows shared one exact model-name right edge, each value followed its actual fill endpoint with an exact 8px gap, and the narrow route retained zero page-level overflow;
- home-preview focused checks render 20px square-left/rounded-right fills without dark remainder tracks; values follow their actual endpoints with an 8px gap;
- the checked home and full leaderboard routes render zero visible public-rank nodes and zero display names beginning with `Claude`; long simplified names remain one line, ellipsize at their boundary, and expose the full simplified value through the name title;
- browser checks at 320, 390, 430, 768, 1024, 1025, 1440, and 1600 CSS-pixel widths found no page-level horizontal overflow. At 1025px and above the speed/price cards share an exact edge; at 1024px and below all four cards stack in reading order with usable bar widths;
- on the desktop grid, the ability/left-speed plot-start delta is exactly 0px, the ability/right-price plot-end delta remains below 0.001px, and the new leading visible ability/price fill-end delta is below 0.001px; all three home previews use the same 180px identity column and 112px value column to preserve the structural baselines;
- speed and price detail checks at 320, 390, 430, 768, 1440, and 1600 widths confirmed one identity and two same-origin, vertically stacked bars per row, one two-item page legend, square-left/right-rounded fills, and no horizontal overflow;
- focused 1053px browser checks confirmed the ability, speed, and price plot grids all render a dedicated 2px `rgba(245, 247, 250, 0.48)` zero-origin layer over the unchanged 1px guide grid, with zero page-level horizontal overflow;
- focused browser checks at the current 1053px review width confirmed both speed controls and both price controls update the active metric, accessible direction state, and rendered order without page-level horizontal overflow; each control uses the corrected 16px glyph with complete vertical strokes, only the left half of the upward arrowhead, and only the right half of the downward arrowhead; speed and price render no masthead description while ability retains its metric description;
- a focused home browser check at 1053px confirmed the advisor action renders `开始选择` at 20px/750 and its arrow at 42px, both in the advisor purple, without page-level horizontal overflow;
- a focused 1053px advisor browser check confirmed the four removed helper/status strings are absent, idle fields have no stale `aria-describedby` references, validation can still attach its error description, the disabled submit state remains intact without a configured API origin, and the action row stays right-aligned with no horizontal overflow;
- rendered detail and home names and values use the system sans stack at 15px/600 with tabular numerals and visually quieter unit spans;
- hash navigation resets detail pages to the top, and the nine fixed creator controls remain visible and horizontally scrollable when the viewport cannot contain them;

Phase 2 data-layer verification retained by the same working tree:

- `npm run test:data-update-policy`: 38/38 passing, including optional identity whitespace normalization, a positive sandboxed public-only sync, and missing-key fail-before-write coverage;
- `npm run test:frontend`: 66/66 passing;
- `npm run test:agent`: 30/30 passing;
- `npm run test:modelops-data`: 12/12 passing;
- `npm run modelops:data:check`: current;
- `npm run build`: TypeScript and Vite production build passing;
- new Node modules pass syntax checks and both modified workflow YAML files parse successfully;
- the sandboxed public-only test fetched both fixture pages, generated only the three public artifacts, proved TypeScript/JSON semantic equality, then reported zero changes in check mode while legacy and ModelOps sentinels remained byte-identical;
- the sandboxed default sync without `AA_API_KEY` preserved all three public artifacts and the legacy AA/ModelOps inputs while retaining the expected AA-skip report and Arena refresh behavior;
- trusted policy parsing accepts LF/CRLF canonical generator output for all three TypeScript snapshots and rejects executable prefix injection;
- the credentialed public-only run fetched 643 unique rows in four pages (`200 + 200 + 200 + 43`), generated exactly the three public artifacts, and left legacy AA/Arena, combined-report, and ModelOps generated artifacts unchanged;
- live coverage counts are Intelligence 630, Coding 255, Agentic 197, input/output price 440 each, and first-answer/output-speed 332 each; all five identity-missing counts are zero;
- the generated TypeScript and backend JSON are semantically equal; all stored IDs, dates, nullable metrics, and non-negative price/performance values passed the strict validators, and the generated files contain no credential markers;
- live selector sizes are Intelligence 630, Coding 255, Agentic 197, Speed 332, and Price 440; competition ranks and pre-filter global ranks were independently checked;
- Node syntax, workflow YAML, tracked/untracked whitespace, `git diff --check`, and production build checks pass.

Not yet verified:

- auto-merge baseline rejection, Pages publication, or Zeabur behavior for this refactor. Exact-head pull-request status must be read from GitHub rather than treated as a frozen project-state fact.

The last recorded pre-refactor production baseline also includes:

- frontend suite: 51/51 passing;
- data-update policy suite: 23/23 passing;
- backend pytest: 92 passing;
- deterministic backend evaluations: 24/24 passing;
- TypeScript/Vite build, Ruff, and mypy passing;
- protected PR verification, Pages deployment, Zeabur health, DeepSeek invoke/SSE, App-authored refresh, anomaly retention, and routine auto-merge live acceptance.

Those older production results describe the deployed architecture and must not be cited as verification of the new target.

## Next

1. Review pull request #15 and confirm its current exact-head check in GitHub before any separately authorized merge.
2. Merge and run Pages/Zeabur acceptance only when separately requested.
3. Implement the Phase 5 footer/social assets as a separate approved scope.
