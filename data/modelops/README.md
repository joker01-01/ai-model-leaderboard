# ModelOps data contracts

This directory separates manually reviewed evidence inputs from deterministic backend-facing output.

## Reviewed inputs

- `model-aliases.json` is the shared exact-version registry used by synchronization and export. `benchmarkVersionIds` binds static benchmark rows, while each `providerModels` entry binds a `(providerId, providerModelId)` pair to one internal model. Similar names, family matches, and provider-swapped IDs are not allowed.
- `pricing.json` contains only exact provider-model offers with stable provider/region IDs, request-size tiers, currency, unit, review dates, and source URL.
- `provider-sources.json` is the allowlist of exact-version provider documents that Agent tools may cite or retrieve.

An empty `entries` array means evidence is currently unavailable. Do not infer structured prices, availability, or licensing from `priceTier`, marketing text, sibling models, or a similar model name.

For pricing entries:

- `offerId` identifies one provider/model/region/currency/billing-mode offer. A tool may return multiple offers, but must never silently select the cheapest or first one.
- `minInputTokensExclusive < input_tokens_per_request <= maxInputTokensInclusive` defines a tier. Every offer starts at zero and its tiers must be contiguous and non-overlapping. `null` means the source gives no upper price-tier boundary; it does not prove unlimited model context.
- `billingMode` is explicit because realtime and batch prices must not be mixed.
- `cachedInputPrice: null` means the cache-hit rate was not captured, never that cached input is free.
- `staleAfter` must be exactly 30 calendar days after `observedAt`; arbitrary long review windows are rejected.
- `validThrough: null` means the source gives no expiry date, never that the price is permanent. The effective inclusive cutoff is the earlier of `staleAfter` and a non-null `validThrough`; an `as_of` date after that cutoff must return stale evidence.
- `providerId` and `regionId` are canonical IDs. Current region IDs are `cn-beijing`, `de-frankfurt`, `sg`, and `us-virginia`.
- `currency` is a controlled code, currently `CNY` or `USD`; an unknown three-letter string is rejected rather than treated as a supported settlement currency.
- Every pricing `(providerId, providerModelId)` pair must be registered for its internal `modelId`, and every `sourceUrl` plus `observedAt` must have a matching exact-provider binding with `kind: "pricing"` in `provider-sources.json`.

The file is a current reviewed snapshot, not price history. A reviewed refresh replaces the previous offer tiers. `regionId` identifies the provider deployment region; it does not prove that an end user in a country can access the service. Absence of a region is `missing_evidence`, never proof that the model is unavailable there. Explicit negative or end-user-country availability evidence is not modeled in Phase A.

Phase A uses a 30-calendar-day freshness window for reviewed prices. Refresh `observedAt` and `staleAfter` only after rechecking the cited source.

An allowlisted provider document is only permission to retrieve that URL. It does not prove a claim until the tool returns an actual matching excerpt.

## Generated output

Files under `generated/` are produced by `npm run modelops:data` from the reviewed inputs and existing TypeScript leaderboard data. Do not edit them by hand.

`npm run modelops:data:check` must exit nonzero when committed generated output differs from a fresh deterministic export. It does not access external providers.

`npm run test:modelops-data` checks strict input failures and proves the generated adapter preserves current public and editorial ranking results.

## Review checklist

Before accepting an evidence-input change:

1. Confirm the exact model version.
2. Prefer the model provider's official documentation.
3. Record the observation date and direct source URL.
4. Set a review deadline and preserve every request-size tier shown by the source.
5. Keep missing or conflicting evidence explicit.
6. Regenerate output and inspect the complete diff.
7. Verify the existing frontend still builds.
