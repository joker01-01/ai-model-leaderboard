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
- Historical implementation plans and reuse research are under `docs/archive/`. They describe earlier decisions, not current deployment status.

## Important Decisions

- Keep one source row per `sourceId`, preserve separate configurations, omit missing metrics, and never infer public values from curated models.
- Mobile home stays one leaderboard per row; do not scale a desktop two-column layout onto phones.
- Advisor ranking is deterministic from AA data. Official evidence can verify or exclude candidates but cannot invent candidates or reorder the AA selection.
- Keep source mappings, generated-data policy, branch protection, credentials, and deployed legacy endpoints intact during repository housekeeping.

## Known Problems

- The last recorded live advisor probe on 2026-09-05 returned a valid AA-only fallback after successful intent parsing, with zero accepted citations. Timeout was a hypothesis, not a confirmed diagnosis. Live official-source verification remains unresolved and was not retested during documentation cleanup.
- Zeabur replica/worker count and exact trusted-proxy CIDRs still need operational verification before scaling or trusting forwarded client IPs.
- Real high-DPR WeChat animation frame rate remains unmeasured. Browser layout checks used host DPR approximately 1 and reduced motion.
- A local Docker image build was not performed because Docker was unavailable during the earlier verification.
- Vite reports a non-failing main-bundle size advisory above 500 kB.

## Verification

- Mobile/animation release: 198 frontend tests across 25 files and TypeScript/production build passed locally. Protected PR checks and Pages deployment passed.
- Layout checks covered 360–480 CSS-pixel phone widths and 1440px desktop, including all public ranking views. No stable-state horizontal page overflow, clipped values, or overlapping metric ticks were found.
- Desktop animation correction: 199 frontend tests and production build pass. Regression coverage includes all three home previews, visible-only work, no per-frame React rerender, button-triggered replay, interruption, and growth under reduced motion. Home alignment uses untransformed fill widths so entry animation does not change its target scale.
- README screenshots were visually reviewed; all seven image references resolve. PR #22 verification passed.
- These are recorded checks of their respective revisions, not fresh backend/live-provider verification.

## Next

- Address advisor live-evidence diagnosis separately: add non-sensitive stage/timing telemetry, reproduce the failure, then adjust only the confirmed failing boundary.
- Continue reviewing active data-refresh PRs through their existing policy; do not close them as stale development work.
- Verify GitHub deployment state live when making a new release claim.
