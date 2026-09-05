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

## Important Decisions

- Keep one source row per `sourceId`, preserve separate configurations, omit missing metrics, and never infer public values from curated models.
- Mobile home stays one leaderboard per row; do not scale a desktop two-column layout onto phones.
- Advisor ranking is deterministic from AA data. Official evidence can verify or exclude candidates but cannot invent candidates or reorder the AA selection.
- Keep source mappings, generated-data policy, branch protection, credentials, and deployed legacy endpoints intact during repository housekeeping.

## Known Problems

- A controlled Zeabur probe confirmed two sequential causes for the live advisor's AA-only fallback: the 30-second verification limit could expire before DeepSeek returned, and a 60-second probe then exposed provider-internal official-site query reformulations/continuation markers that the exact-query validator rejected. The local production-closure branch raises the configured default to 60 seconds and accepts only registry-scoped, frozen-candidate reformulations plus bounded continuation markers; deployment and live-citation acceptance are still pending.
- Data-refresh PR #18 passed fetching, generated-data checks, the update policy, and the ModelOps contract, but its remaining checks were blocked by a frontend test that hard-coded the previous observation date. The local production-closure branch derives that assertion from the current generated snapshot; the refresh must be regenerated from the eventual new `main` so its signed commit parent and verification inputs remain current.
- Zeabur replica/worker count and exact trusted-proxy CIDRs still need operational verification before scaling or trusting forwarded client IPs.
- Real high-DPR WeChat animation frame rate remains unmeasured. Browser layout checks used host DPR approximately 1 and reduced motion.
- A local Docker image build was not performed because Docker was unavailable during the earlier verification.
- Vite reports a non-failing main-bundle size advisory above 500 kB.

## Verification

- Mobile/animation release: 198 frontend tests across 25 files and TypeScript/production build passed locally. Protected PR checks and Pages deployment passed.
- Layout checks covered 360–480 CSS-pixel phone widths and 1440px desktop, including all public ranking views. No stable-state horizontal page overflow, clipped values, or overlapping metric ticks were found.
- Desktop animation correction: 199 frontend tests and production build pass. Regression coverage includes all three home previews, visible-only work, no per-frame React rerender, button-triggered replay, interruption, and growth under reduced motion. Home alignment uses untransformed fill widths so entry animation does not change its target scale.
- README screenshots were visually reviewed; all seven image references resolve. PR #22 verification passed.
- Production-closure local verification passes: all 199 frontend tests, production build, generated-data checks, routine update-policy tests, the full backend test suite, Ruff, mypy, and all 29 deterministic evaluations. The DeepSeek gateway's 60 focused tests include the exact production reformulations and Unicode/cross-creator/query-injection rejection cases.
- These are recorded checks of their respective revisions, not fresh backend/live-provider verification.

## Next

- Publish the production-closure branch through a protected pull request, set Zeabur's non-secret advisor timeout to 60 seconds, and require one live result with accepted official citations before closing the advisor issue.
- Rerun the signed data-refresh workflow from the resulting `main`; require green verification and let the existing trusted policy decide whether PR #18 qualifies for automatic merge.
- Update this state with the exact merged revisions and live deployment results.
