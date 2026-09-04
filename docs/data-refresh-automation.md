# Conditional data-refresh automation

## Status

The repository implementation is complete, but automatic publication is not active yet. Activation requires a repository-scoped GitHub App, two Actions settings, protected required checks on `main`, and live acceptance.

This automation applies only to the scheduled external-data refresh. The Agent `prepare_data_update` operation remains a pure `awaiting_human_review` proposal and cannot write files, operate Git, or publish.

## Publication path

1. `.github/workflows/sync-data.yml` synchronizes AA/Arena data, regenerates the ModelOps adapter, and runs the full offline verification suite.
2. A repository-scoped GitHub App creates or updates `chore/refresh-leaderboard-data` with a verified App signature.
3. The normal pull-request workflow runs with read-only permissions.
4. After successful verification, `.github/workflows/auto-merge-data.yml` loads the policy from trusted `main`; it never checks out or executes pull-request code and never consumes pull-request artifacts or caches.
5. `scripts/data-update-policy.mjs` permits only modifications to these generated files:
   - `data/modelops/generated/catalog.json`
   - `data/modelops/generated/evidence.json`
   - `data/sync-report.json`
   - `src/data/generated/aaSnapshot.ts`
   - `src/data/generated/arenaSnapshot.ts`
6. Automatic merge requires stable exact-match membership, stable source/model identities, no ambiguity or skipped source, unchanged curated/static evidence, successful required checks, verified App-signed commits, and unchanged PR head/base/current-`main` SHAs.
7. Any failed condition leaves the pull request open for human review. The workflow never pushes generated data directly to `main`.

## GitHub control-plane setup

Create a dedicated GitHub App under the repository owner's developer settings:

- Install it only on `joker01-01/ai-model-leaderboard`.
- Repository permissions: **Contents — Read and write**, **Pull requests — Read and write**. Metadata read access is implicit. Do not grant organization/account permissions or Workflows write access.
- Disable webhooks because this repository does not use an App webhook receiver.
- Generate and download one private key.

In the repository's **Settings → Secrets and variables → Actions**, add:

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

## First activation

The existing PR `#3` was created by `github-actions[bot]` on the fixed refresh branch. Close that PR and delete `chore/refresh-leaderboard-data` before the first App-authenticated run; updating the old PR would not change its original author and the gate would correctly reject it.

Then manually run **Refresh leaderboard data** from Actions. If upstream values changed, confirm:

- the pull request author and every commit signature belong to the dedicated App bot;
- `Verify pull request / verify` succeeds;
- the policy workflow merges the exact verified head SHA;
- the resulting `main` push starts GitHub Pages deployment and the Zeabur deployment linked to `main`;
- the public leaderboard and backend health endpoint remain available.

If upstream data has not changed, a no-PR run is expected and does not prove the merge path. Wait for or deliberately stage a separately reviewed test refresh before claiming live automatic-merge acceptance.

## Failure and rollback

- Policy rejection or malformed data: inspect the open PR and `data/sync-report.json`; do not override the gate until the source/version mapping is reviewed.
- Compromised or unwanted automation: disable **Refresh leaderboard data**, uninstall the App, or remove `DATA_SYNC_APP_PRIVATE_KEY`.
- Failed deployment after a merge: revert the merge through a normal reviewed PR. GitHub Pages and Zeabur remain linked only to `main`.
