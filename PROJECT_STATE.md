# Project State

## Goal

Maintain the published AI model leaderboard and one-shot model advisor. Product behavior is defined in `DESIGN.md`; durable implementation and safety rules are in `AGENTS.md`.

## Architecture

- React 19 / TypeScript / Vite frontend deployed to GitHub Pages from protected `main`.
- `src/App.tsx` and `src/lib/hashRoute.ts` expose the home directory, three ability views, speed, price, and advisor routes.
- Public rankings read `src/data/generated/aaPublicSnapshot.ts` through strict AA contracts and deterministic selectors. The backend advisor reads the corresponding JSON snapshot.
- FastAPI provides the one-shot advisor endpoint and the preserved legacy ModelOps invoke/SSE endpoints. Zeabur builds the repository-root Dockerfile from `main`.
- Curated exact-version data, legacy UI/tools, and synchronization consumers remain separate from the public AA rankings. They still have tests and backend/sync dependencies and are not removed by documentation cleanup.
- Scheduled synchronization prepares signed data PRs. Only qualifying generated-data changes can auto-merge after verification; code and documentation use protected PR review.

## Current Status

- The public frontend, advisor form, brand assets, and home footer are published. Mobile presentation and animation fixes merged in PR #20 (`fd8771c`).
- README is a concise product introduction with seven real page screenshots. PR #22 merged as `c869362`; its GitHub Pages deployment succeeded, checked on 2026-09-06.
- Phones up to 620 CSS pixels fit a 760px single-column canvas to the available width. Home displays Top 3 per ranking; tablet/desktop display Top 5. Complete rankings retain every eligible row.
- Home previews, detail entry, and metric/creator/sort changes play a 600ms animation. Visible bars use Web Animations transforms and one number-text RAF per chart; unsupported browsers show final values. The user explicitly chose chart growth regardless of the OS reduced-motion setting.
- Superseded frontend/ModelOps implementation plans and initial reuse research have been removed from the repository tree. Historical copies remain available in Git history; current design and operational documentation remain maintained.
- Advisor production compatibility fixes merged through PRs #27-#35. Current `main` is `b52f280`: the timeout is 60 seconds, validated provider reformulations and bounded continuation markers are replayed, unregistered navigation is ignored without becoming evidence, and the second response is constrained to one strict JSON object.
- Zeabur deployment `deployment-6a9cb5957066abe5dab30731` is running the PR #35 revision. A public advisor request on 2026-09-06 returned a schema-valid deterministic recommendation in 25.34 seconds.

## Important Decisions

- Keep one source row per `sourceId`, preserve separate configurations, omit missing metrics, and never infer public values from curated models.
- Mobile home stays one leaderboard per row; do not scale a desktop two-column layout onto phones.
- Advisor ranking is deterministic from AA data. Official evidence can verify or exclude candidates but cannot invent candidates or reorder the AA selection.
- Keep source mappings, generated-data policy, branch protection, credentials, and deployed legacy endpoints intact during repository housekeeping.

## Known Problems

- DeepSeek currently returns no claim-bound citation metadata through this Responses integration. Controlled production-container probes covered `json_object`, plain-text JSON, natural-language text, and provider auto-continuation; every completed output had zero raw `output_text.annotations`, and bounded `web_search_call` items exposed zero source URLs. DeepSeek's current public Responses documentation shows an empty annotations array but does not define or guarantee non-empty URL citations. The service therefore fails closed to `aa_only`; it must not promote search actions, restored results, prose, or model-written URLs into evidence.
- Data-refresh PR #18 was regenerated from `b52f280` and all fetch, contract, frontend, backend, and policy checks passed. Auto-merge correctly stopped because AA Intelligence moved from 4.1 to 4.2, Agentic finite coverage fell from 197 to 100, and legacy AA compatibility membership changed. PR #18 remains open for explicit review of those upstream methodology and coverage changes.
- Zeabur replica/worker count and exact trusted-proxy CIDRs still need operational verification before scaling or trusting forwarded client IPs.
- Real high-DPR WeChat animation frame rate remains unmeasured. Browser layout checks used host DPR approximately 1 and reduced motion.
- A local Docker image build was not performed because Docker was unavailable during the earlier verification.
- Vite reports a non-failing main-bundle size advisory above 500 kB.

## Verification

- Mobile/animation release: 198 frontend tests across 25 files and TypeScript/production build passed locally. Protected PR checks and Pages deployment passed.
- Layout checks covered 360–480 CSS-pixel phone widths and 1440px desktop, including all public ranking views. No stable-state horizontal page overflow, clipped values, or overlapping metric ticks were found.
- Desktop animation correction: 199 frontend tests and production build pass. Regression coverage includes all three home previews, visible-only work, no per-frame React rerender, button-triggered replay, interruption, and growth under reduced motion. Home alignment uses untransformed fill widths so entry animation does not change its target scale.
- README screenshots were visually reviewed; all seven image references resolve. PR #22 verification passed.
- Advisor PR #35 passed pull-request Verify run `34001674300`; merged-`main` Verify `34001738831` and Pages deployment `34001738825` passed. Zeabur then reported the exact PR #35 deployment as Running.
- A direct production-container gateway call returned all five frozen candidates without an exception and downgraded every unsupported check to unverified. A public `POST /api/v1/advisor/recommend` returned HTTP 200 with a schema-valid `aa_only` recommendation and two alternatives in 25.34 seconds.
- Live compatibility probes established the citation boundary without logging credentials, requirements, returned prose, or URLs in application telemetry: the provider returned zero raw annotations and zero exposed search-source URLs. Plain-text JSON could satisfy the strict local schema, but changing output format did not produce citations; natural-language output likewise returned zero annotations.
- Signed refresh run `34002452998` passed after one upstream `ECONNRESET` retry. PR #18 Verify run `34002517870` passed, and policy run `34002569376` correctly retained the PR for human review instead of merging it.
- These are recorded checks of their respective revisions. The strict citation gates remain locally covered; no live accepted official citation exists with the current DeepSeek Responses behavior.

## Next

- Publish the raw-annotation aggregate diagnostics through a protected pull request, then confirm the same zero/nonzero counters from the deployed revision without recording response content.
- Merge PR #18 only after explicit acceptance of the AA v4.2 scale change, the Agentic 197-to-100 coverage reduction, and the resulting advisor-candidate impact. Missing Agentic values remain missing, never zero.
- To enable `partial` or `verified` advisor results, use a reviewed provider/tool contract that exposes claim-bound citation URLs, or revalidate after DeepSeek documents and emits URL annotations. Do not weaken the official-domain, candidate-slot, redirect, or annotation-containment gates.
- Keep `MODELOPS_TRUSTED_PROXY_CIDRS` empty until Zeabur publishes or confirms the exact ingress ranges.
