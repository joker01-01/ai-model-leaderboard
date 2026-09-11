# Project State

## Goal

Maintain the published AI model leaderboard and one-shot model advisor. Product behavior is defined in `DESIGN.md`; durable implementation and safety rules are in `AGENTS.md`.

## Architecture

- React 19 / TypeScript / Vite frontend deployed to GitHub Pages from protected `main`.
- `src/App.tsx` and `src/lib/hashRoute.ts` expose the home directory, three ability views, speed, price, and advisor routes.
- Public rankings read `src/data/generated/aaPublicSnapshot.ts` through strict AA contracts and deterministic selectors. The backend advisor reads the corresponding JSON snapshot.
- The public advisor uses DeepSeek only for strict intent parsing and optional no-search notes for the AA-selected Top 3. The older search-capable advisor gateway is preserved compatibility code and is not part of the public application path.
- FastAPI provides the one-shot advisor endpoint and the preserved legacy ModelOps invoke/SSE endpoints. Zeabur builds the repository-root Dockerfile from `main`.
- Curated exact-version data, legacy UI/tools, and synchronization consumers remain separate from the public AA rankings. They still have tests and backend/sync dependencies and are not removed by documentation cleanup.
- Scheduled synchronization prepares signed data PRs. Only qualifying generated-data changes can auto-merge after verification; code and documentation use protected PR review.

## Current Status

- The AA repository completeness test compares loaded source IDs with the source snapshot instead of requiring exactly 643 rows. Regression coverage allows complete model additions/removals and rejects missing rows; production parsing and data publication safeguards are unchanged.
- The public frontend, advisor form, brand assets, and home footer are published. Mobile presentation and animation fixes merged in PR #20 (`fd8771c`).
- README is a concise product introduction with seven real page screenshots. PR #22 merged as `c869362`; its GitHub Pages deployment succeeded, checked on 2026-09-06.
- Phones up to 620 CSS pixels fit a 760px single-column canvas to the available width. Home displays Top 3 per ranking; tablet/desktop display Top 5. Complete rankings retain every eligible row.
- Home previews, detail entry, and metric/creator/sort changes play a 600ms animation. Visible bars use Web Animations transforms and one number-text RAF per chart; unsupported browsers show final values. The user explicitly chose chart growth regardless of the OS reduced-motion setting.
- Superseded frontend/ModelOps implementation plans and initial reuse research have been removed from the repository tree. Historical copies remain available in Git history; current design and operational documentation remain maintained.
- The public Advisor now uses a no-search two-stage flow: strict DeepSeek intent parsing, deterministic AA filtering/order, then an optional strict note for each frozen Top 3 candidate. Both provider requests explicitly disable tools; there is no continuation or URL retrieval.
- The public response wire contract remains compatible; the revised runtime contract constrains produced outputs to `verification_status = "aa_only"`, empty candidate `checks`, and empty top-level `citations` and `rejections`. DeepSeek knowledge notes cannot filter, replace, or reorder candidates and are never interpreted as verification of hard requirements or deployment region.
- The Advisor UI now presents normal results as `未联网核验`, states that AA owns ranking and values, warns that model knowledge may be stale, and says hard requirements and deployment region were not verified or used for filtering. Older `verified`/`partial` payloads remain parser/display compatibility only.
- PR #40 merged as `473cccc`; documentation follow-up PR #41 merged as `f2eca68`. GitHub Pages and Zeabur publish the no-search Advisor from protected `main`, and Zeabur reports one Running instance.
- Knowledge-note validation treats a single literal `~` as plain approximation text while continuing to reject actual `~~` Markdown strikethrough, other Markdown, and URL-like content. PR #42 released this production false-positive fix without changing the AA-only evidence boundary.
- The Advisor UI removes `MODEL ADVISOR`, uses the advisor purple for the Chinese title, shows only requirement plus optional deployment region, places `获取推荐` to the region field's right, sends `budget: null` from the browser, and renders no idle result placeholder. Focused frontend tests and local desktop/mobile browser acceptance passed, and the Advisor screenshot was refreshed.
- The public deployment-region free-text field has been replaced by a native select. Its ordered mappings are `不指定` -> `null`, `中国大陆` -> `Mainland China`, `中国香港` -> `Hong Kong`, `新加坡` -> `Singapore`, `日本` -> `Japan`, `韩国` -> `South Korea`, `美国` -> `United States`, `加拿大` -> `Canada`, `欧盟` -> `European Union`, `英国` -> `United Kingdom`, and `澳大利亚` -> `Australia`. PR #45 merged as `f47a81f`; merged-main Verify and Pages deployment passed, and the published desktop/mobile page was accepted.
- The Advisor back control aligns with the shell's 32px left inset instead of the viewport edge. Focused browser checks at 1053px and a scaled 390px phone viewport confirmed exact shell alignment and no horizontal overflow; the Advisor screenshot was refreshed.

## Important Decisions

- Keep one source row per `sourceId`, preserve separate configurations, omit missing metrics, and never infer public values from curated models.
- Mobile home stays one leaderboard per row; do not scale a desktop two-column layout onto phones.
- Advisor membership, filtering, metrics, cost calculations, and ordering are deterministic from AA data. DeepSeek may parse the strict intent and add explicitly unverified, URL-free existing-knowledge notes only after the Top 3 is frozen.
- Public Advisor requests never enable `web_search`, continue a provider response, or fetch citation URLs. “No web search” still requires remote DeepSeek API access for intent parsing and optional notes; it is not a fully offline service.
- Hard requirements and deployment region remain unverified request context and never filter or reorder candidates. The revised public runtime must keep every response `aa_only` with empty checks, citations, and rejections; provider/configuration/capacity failure falls back to deterministic AA-only output.
- The public browser has no budget UI and always sends `budget: null`; the backend/API retains its optional validated budget-object contract for compatibility. The idle Advisor has no result placeholder, and its submit action remains to the right of the optional deployment-region select.
- The browser's fixed deployment-region choices are unverified preference values and never assert provider availability or affect filtering/order. The backend/API continues to accept any clean deployment-region string or `null` for compatibility; it is not narrowed to the browser option set.
- Keep source mappings, generated-data policy, branch protection, credentials, and deployed legacy endpoints intact during repository housekeeping.

## Known Problems

- Data PR #47 is blocked by the old fixed-count test (latest failure: 645 versus 643). After this test repair merges, rerun the refresh workflow from updated main to regenerate and reverify the App-signed data PR before policy evaluation.
- Data-refresh PR #18 was regenerated from `a0f5e7b` as App-signed head `ee615ac`; all fetch, contract, frontend, backend, and policy checks passed. Auto-merge correctly stopped because AA Intelligence moved from 4.1 to 4.2, Agentic finite coverage fell from 197 to 100, and legacy AA compatibility membership changed. PR #18 remains open for explicit review of those upstream methodology and coverage changes.
- The deployed service showed one healthy instance and the Docker command fixes Uvicorn at one worker. Exact Zeabur trusted-proxy CIDRs remain unverified, so forwarded client IP headers must stay disabled and `MODELOPS_TRUSTED_PROXY_CIDRS` empty.
- Real high-DPR WeChat animation frame rate remains unmeasured. Browser layout checks used host DPR approximately 1 and reduced motion.
- A local Docker image build was not performed because Docker was unavailable during the earlier verification.
- Vite reports a non-failing main-bundle size advisory above 500 kB.

## Verification

- Repository test repair: 15 focused tests passed on current main with the patch. Prior isolated verification of PR #47 at `9438fde` plus this same patch passed 340 backend tests, Ruff, mypy, and 29 deterministic evaluations. The current PR and refresh workflows remain the release gate for newer snapshots.
- Mobile/animation release: 198 frontend tests across 25 files and TypeScript/production build passed locally. Protected PR checks and Pages deployment passed.
- Layout checks covered 360–480 CSS-pixel phone widths and 1440px desktop, including all public ranking views. No stable-state horizontal page overflow, clipped values, or overlapping metric ticks were found.
- Desktop animation correction: 199 frontend tests and production build pass. Regression coverage includes all three home previews, visible-only work, no per-frame React rerender, button-triggered replay, interruption, and growth under reduced motion. Home alignment uses untransformed fill widths so entry animation does not change its target scale.
- README screenshots were visually reviewed; all seven image references resolve. PR #22 verification passed.
- Advisor PR #35 passed pull-request Verify run `34001674300`; merged-`main` Verify `34001738831` and Pages deployment `34001738825` passed. Zeabur then reported the exact PR #35 deployment as Running.
- A direct production-container gateway call returned all five frozen candidates without an exception and downgraded every unsupported check to unverified. A public `POST /api/v1/advisor/recommend` returned HTTP 200 with a schema-valid `aa_only` recommendation and two alternatives in 25.34 seconds.
- Live compatibility probes established the citation boundary without logging credentials, requirements, returned prose, or URLs in application telemetry: the provider returned zero raw annotations and zero exposed search-source URLs. Plain-text JSON could satisfy the strict local schema, but changing output format did not produce citations; natural-language output likewise returned zero annotations.
- Advisor diagnostics PR #36 passed pull-request Verify run `34003799852`; merged-`main` Verify `34003886190` and Pages deployment `34003886187` passed. Zeabur deployment `deployment-6a9cc138aad15df0678d3ec5` then ran that exact revision.
- Production logging PR #37 passed pull-request Verify run `34004621048`; merged-`main` Verify `34004687146` and Pages deployment `34004680397` passed. Zeabur deployment `deployment-6a9cc58caad15df0678d3f30` reported Running with healthy `/healthz` probes.
- A public request against the PR #37 deployment completed in 29.73 seconds as `aa_only`. Its production log recorded `candidate_count=5`, `actions=26`, `queries=29`, `exact_queries=8`, `ignored_searches=5`, `replayed_actions=1`, zero provider/raw/URL/valid annotations, zero accepted citations, three downgraded checks, and a 27.903-second verification duration. The advisor diagnostic events for that request contained only the designed aggregate fields.
- Final signed refresh run `34005442709` started from `main` at `a0f5e7b` and produced App-signed PR #18 head `ee615ac`. PR Verify run `34005499640` passed, and policy run `34005549017` correctly retained the PR for the same human-review gates instead of merging it.
- These are historical checks of their respective search-era revisions; they do not verify the new no-search implementation.
- The no-search backend passed 38 focused pytest cases. Coverage includes explicit `tool_choice: "none"`, absence of tools/continuation fields, strict response envelopes, URL-like/common-Markdown rejection, exact frozen-slot coverage, deterministic AA order, empty evidence arrays, capacity/failure fallback, and cancellation.
- The complete local gate passed on 2026-09-06: 199 frontend tests, the TypeScript/Vite production build, the full backend pytest suite, Ruff, mypy across `app tests evals`, and all 29 deterministic evaluations including five public-Advisor cases. Vite retained the existing non-failing main-bundle size advisory.
- The Advisor desktop page was visually checked at the 1440px breakpoint and `docs/screenshots/advisor.jpg` was refreshed with the no-search explanatory copy.
- No-search PR #40 passed pull-request Verify run `34017366051`; merged-`main` Verify run `34017432761` and Pages run `34017432848` passed. Zeabur then reported the PR #40 deployment Running from `main`.
- Post-deployment `/healthz` returned `ok`. One bounded public Advisor request returned `recommendation`, `aa_only`, two alternatives, and empty checks, citations, and rejections. Its reason remained the deterministic AA explanation because the optional knowledge-note batch fell back.
- Sanitized production-container diagnostics isolated that fallback to the Markdown detector rejecting a single ASCII `~` used as an approximation marker in otherwise schema-valid notes. A focused regression failed with the previous detector; after the narrow fix, all 22 offline-gateway unit tests and targeted Ruff checks passed.
- PR #42 passed pull-request Verify run `34020282845`; merged-`main` Verify run `34020344535` and Pages run `34020344545` passed. Zeabur then reported the PR #42 revision Running from `main`; `/healthz` returned `ok`, and one bounded public Advisor request returned all three optional knowledge notes while preserving `aa_only` and empty checks, citations, and rejections.
- The published Pages bundle contains the AA-snapshot/no-search explanation and no longer contains the former controlled-source or live-verification copy.
- The preceding Advisor UI simplification was checked with the two directly related frontend test files and local desktop/mobile browser layouts. The full frontend suite and production build were delegated to its protected pull-request gate.
- The deployment-region native-select refinement passed 14 focused tests across `AdvisorForm.test.tsx` and `App.test.tsx`. Local desktop and mobile checks confirmed the exact option values, `不指定` default, `新加坡` -> `Singapore`, matching 48px desktop control heights, visible keyboard focus, single-column mobile layout, and no horizontal overflow. PR #45 pull-request Verify run `34022183706`, merged-main Verify run `34022249927`, and Pages run `34022249900` passed; the deployed cache-isolated Advisor was accepted with no console errors.
- The Advisor back-control inset was checked in the browser at 1053px and at a scaled 390px phone viewport. In both layouts its left edge exactly matched the shell's left edge and the page had no horizontal overflow. `docs/screenshots/advisor.jpg` reflects the corrected placement; no local full suite was rerun for this one-line CSS adjustment.

## Next

- Merge PR #18 only after explicit acceptance of the AA v4.2 scale change, the Agentic 197-to-100 coverage reduction, and the resulting advisor-candidate impact. Before manual merge, confirm the signed head was generated from then-current runtime code on `main`; rerun and re-review only if it has become stale. Missing Agentic values remain missing, never zero.
- Keep `MODELOPS_TRUSTED_PROXY_CIDRS` empty until Zeabur publishes or confirms the exact ingress ranges.
