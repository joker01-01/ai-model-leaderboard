# Artificial Analysis data boundaries

`generated/` contains reproducible source-native AA artifacts. Do not edit those files by hand; `scripts/sync-data.mjs` owns their contents.

`official-sources.json` is a reviewed input for the one-shot advisor. It binds opaque AA `creatorId` values to official website scopes and official GitHub organizations. It is intentionally independent from the curated ModelOps catalog and provider allowlists.

Registry rules:

- add only sources that have been independently reviewed for the exact `creatorId`;
- keep hosts as lowercase ASCII DNS names and paths as canonical directory prefixes;
- bind GitHub entries to one organization under exact `github.com`;
- treat registry changes as human-reviewed code/data changes, never routine generated refreshes;
- keep unregistered creators eligible for deterministic AA ranking, but never describe them as fully live-verified;
- validate every citation URL, redirect hop, and final URL against the same candidate creator binding.

`official-sources.schema.json` documents the stored JSON shape. Runtime validation in `backend/app/repositories/official_sources.py` additionally enforces cross-entry uniqueness and URL-binding rules that JSON Schema cannot express directly.
