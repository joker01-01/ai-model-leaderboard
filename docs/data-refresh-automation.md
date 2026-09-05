# Conditional data-refresh automation

## Status

The repository-scoped GitHub App, protected `main` rules, anomaly-retention path, and routine automatic-merge workflow are implemented. The reviewed full source-native AA snapshot and its extended policy are committed on `main`; they are no longer an unpublished local checkpoint. Inspect each current data PR and its checks for live refresh status. Earlier live automation verification was recorded on 2026-09-04 and does not prove every later refresh will qualify for automatic merging.

This automation applies only to the scheduled external-data refresh. The Agent `prepare_data_update` operation remains a pure `awaiting_human_review` proposal and cannot write files, operate Git, or publish.

## Publication path

1. `.github/workflows/sync-data.yml` reads every AA page, generates the complete source-native AA snapshot and review report, maintains the legacy 20-row compatibility snapshot, separately synchronizes exact-version curated AA/Arena evidence, regenerates the ModelOps adapter, and runs the full offline verification suite.
2. A repository-scoped GitHub App creates or updates `chore/refresh-leaderboard-data` with one App-authored, GitHub-signed commit.
3. The normal pull-request workflow runs with read-only permissions.
4. After successful verification, `.github/workflows/auto-merge-data.yml` loads the policy from trusted `main`; it never checks out or executes pull-request code and never consumes pull-request artifacts or caches.
5. `scripts/data-update-policy.mjs` permits only modifications to these generated files:
   - `data/aa/generated/snapshot.json`
   - `data/aa/generated/sync-report.json`
   - `data/modelops/generated/catalog.json`
   - `data/modelops/generated/evidence.json`
   - `data/sync-report.json`
   - `src/data/generated/aaPublicSnapshot.ts`
   - `src/data/generated/aaSnapshot.ts`
   - `src/data/generated/arenaSnapshot.ts`
6. Automatic merge requires a previously reviewed full-snapshot baseline, stable public schema/wire fingerprint/Intelligence Index version and existing identity metadata, semantically equal TypeScript/JSON snapshots, consistent pagination/report proof, no greater-than-20-percent total-row or per-metric coverage loss, stable curated exact-match membership and source identities, no ambiguity or skipped source, unchanged curated/static evidence, and successful required checks. After the baseline, ordinary public model additions/removals and metric value/date/order changes may be routine. Structural changes and threshold violations require human review.
7. Provenance checks still require exactly one App-authored GitHub-signed commit with the expected `web-flow` committer, fixed message, valid verification and parent SHA, and unchanged PR head/base/current-`main` SHAs.
8. Any failed condition leaves the pull request open for human review. The workflow never pushes generated data directly to `main`.

## Current control plane and recreation

The live configuration uses a dedicated GitHub App installed only on this repository, repository Actions credentials, and protected `main`. To recreate it under the repository owner's developer settings:

- Install it only on `joker01-01/ai-model-leaderboard`.
- Repository permissions: **Contents — Read and write**, **Pull requests — Read and write**. Metadata read access is implicit. Do not grant organization/account permissions or Workflows write access.
- Disable webhooks because this repository does not use an App webhook receiver.
- Generate and download one private key.

In the repository's **Settings → Secrets and variables → Actions**, configure:

- Variable `DATA_SYNC_APP_CLIENT_ID`: the App client ID.
- Secret `DATA_SYNC_APP_PRIVATE_KEY`: the complete downloaded PEM private key.
- Keep the existing `AA_API_KEY` secret for fresh Artificial Analysis data.

Protect `main` with a ruleset or branch protection that:

- requires changes to arrive through a pull request;
- requires the `verify` status check and requires the branch to be current before merging;
- blocks force pushes and branch deletion;
- does not put the data-sync App in a bypass list;
- uses zero required human approvals so a policy-approved routine refresh can merge, while anomaly PRs remain open because the merge workflow rejects them.

The repository's native **Allow auto-merge** switch is not required; the trusted workflow performs a guarded REST merge after all conditions pass.

The downloaded local PEM used during setup was deleted after App-token creation succeeded. GitHub cannot re-download that private key; generate a replacement in the App settings and rotate `DATA_SYNC_APP_PRIVATE_KEY` if recovery or rotation is required.

## Live acceptance

- [PR #8](https://github.com/joker01-01/ai-model-leaderboard/pull/8) aligned the provenance guard with the real GitHub commit representation: the App is the author, GitHub's `web-flow` account is the committer, and GitHub reports a valid signature. Its complete [`verify` run](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33848800831) passed before merge commit `5a8a3f0` reached `main`.
- The App-authenticated refresh run [`33857550307`](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33857550307) updated [PR #7](https://github.com/joker01-01/ai-model-leaderboard/pull/7). The PR changed only four allowed generated files and its [`verify` run](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33858046203) passed, but policy run [`33858519972`](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33858519972) retained it for human review because GLM-5.3 gained an exact AA match while DeepSeek V4 Flash lost an Arena observation. After review, it was accepted as baseline commit `223b1c3`.
- Refresh run [`33858638289`](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33858638289) then opened routine [PR #9](https://github.com/joker01-01/ai-model-leaderboard/pull/9). Its [`verify` run](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33859147546) passed, and trusted policy run [`33859611973`](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33859611973) independently classified the four generated-file changes as routine, rechecked immutable provenance and SHAs, and automatically merged the exact head as `ce49c8e`.
- Keyed refresh run [`33865744426`](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33865744426) opened [PR #11](https://github.com/joker01-01/ai-model-leaderboard/pull/11) with the legacy 20-row public AA Intelligence baseline. Its [`verify` run](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33865823234) passed; because membership and Index version were new, the policy retained it for human review before merge commit `475ba4d` entered the feature branch.
- The fixed refresh branch was deleted after the merge. A future scheduled run recreates it only when generated output changes.
- Post-merge [`main` verification](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33859647251) and [GitHub Pages deployment](https://github.com/joker01-01/ai-model-leaderboard/actions/runs/33859647300) passed. The public leaderboard, Zeabur status page, and `/healthz` each returned HTTP 200; a live DeepSeek-backed invoke resolved `GLM-5.3` exactly and reported its newly accepted same-version AA Intelligence evidence, confirming that the backend loaded the accepted snapshot.

Together, PR #7 and PR #9 prove fail-closed anomaly handling and unattended routine publication for the curated snapshot pipeline. PR #11 proves the human-reviewed legacy 20-row membership/version baseline. It does not prove the new complete three-artifact snapshot path; that path still needs a human-reviewed first publication followed by a qualifying routine refresh. If a future run has no generated diff, a successful no-PR result is expected but does not add merge-path evidence.

## Failure and rollback

- Policy rejection or malformed data: inspect the full public snapshot/report under `data/aa/generated/`, public `sourceId` identity metadata, pagination and coverage counts, index version, curated source/version mappings, and legacy `data/sync-report.json`; do not override the gate until the change is reviewed.
- Compromised or unwanted automation: disable **Refresh leaderboard data**, uninstall the App, or remove `DATA_SYNC_APP_PRIVATE_KEY`.
- Failed deployment after a merge: revert the merge through a normal reviewed PR. GitHub Pages and Zeabur remain linked only to `main`.
