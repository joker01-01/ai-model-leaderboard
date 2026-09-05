# AI Model Leaderboard Design Specification

> Product direction confirmed by the user. This specification defines the target behavior; `PROJECT_STATE.md` records which parts are implemented, verified, and deployed.

Phone layout revision: at viewport widths up to 620 CSS pixels, scale a 1100px desktop canvas uniformly to fit. Preserve desktop card columns and model/bar alignment rather than reflowing mobile rows. The earlier stacked mobile descriptions apply only to the remaining tablet breakpoints (621-1024px). Native browser zoom remains available. This deliberately reduces text and control sizes for the user-requested proportional-layout trial.

## 1. Product definition

The product is a simple directory for answering three questions:

1. Which AI models are strongest?
2. How fast are the models, and what do they cost?
3. Which model best fits one concrete need?

The audience is a Chinese-speaking developer or AI user who wants a quick answer first and a complete source-native ranking after one click. The page is not an admin dashboard, an editorial magazine, or a visible Agent trace console.

The single visual signature is a set of compact cards built from real leaderboard bars. Decorative charts, ornamental AI gradients, oversized marketing copy, and nested glass panels are excluded.

## 2. Information architecture

```text
App
├─ HomePage
│  ├─ 模型能力榜单
│  ├─ 模型速度榜单
│  ├─ 模型价格榜单
│  ├─ 按需求选模型
│  └─ SiteFooter
├─ AbilityPage
│  └─ 综合智能 / 编程智能 / 智能体能力
├─ EfficiencyPage
│  └─ 速度 / 价格
└─ AdvisorPage
   └─ one-shot recommendation form and result
```

Hash routes are required so GitHub Pages can refresh and deep-link without a server-side router:

- empty hash or `#/`
- `#/ability/intelligence`
- `#/ability/coding`
- `#/ability/agentic`
- `#/efficiency/speed`
- `#/efficiency/price`
- `#/advisor`

Unknown hashes return to the home page. Every detail-page back arrow always links to `#/`, including after a direct deep link; browser back/forward navigation remains functional through the hash history.

Detail headers center the page title while the back control remains pinned to the left. Ability, speed, and price headers contain only their titles. Source attribution and the update date appear only in the home footer.

## 3. Home page

The initial viewport contains the title `AI 模型排行榜` and four cards. It does not open a leaderboard by default.

```text
┌──────────────────────────────────────────────────────────────┐
│                       AI 模型排行榜                          │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 模型能力榜单 · Intelligence 前 5 单条预览               │ │
│ ├────────────────────────────┬─────────────────────────────┤ │
│ │ 模型速度榜单               │ 模型价格榜单                │ │
│ │ 首字延迟前 5 单条预览       │ 输出价格前 5 单条预览        │ │
│ ├────────────────────────────┴─────────────────────────────┤ │
│ │                       按需求选模型                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│                       ○   ○   ○                             │
│  数据来源：Artificial Analysis · 更新日期：YYYY-MM-DD         │
└──────────────────────────────────────────────────────────────┘
```

On desktop, the ability card spans the full first row. The speed and price cards share one edge in a two-column second row, and the advisor spans the full row below them. Its `开始选择` action uses the advisor purple at 20–24px with a matching 42px arrow so the destination reads as a primary call to action. Home preview bars retain a clearly visible 20px thickness, with a square left edge and semicircular right edge. No single-metric chart draws a dark remainder track; each value sits 8px after the actual fill endpoint. Home and full-detail model names and values use 15px type, and all units stay visually quieter. All three ranking previews use the same single-bar row grammar and shared identity/plot widths: the ability plot begins on the speed plot's vertical baseline and its plot boundary ends on the price plot's vertical baseline. The leading visible ability fill also ends exactly on the leading visible price fill. To satisfy that visible desktop composition without filling either plot, the home ability preview uses a responsive linear ceiling derived from those rendered endpoints; lower ability rows retain their exact linear proportions. The speed preview uses a deterministic readable ceiling strictly above the slowest displayed top-five latency, while the price preview uses one strictly above the largest observed output price. At 1024px and below, all four cards stack in the order ability, speed, price, advisor, the ability preview returns to its absolute 0–100 AA scale, and narrow preview rows place model identity above the bar to prevent horizontal overflow.

Card destinations and preview rules are fixed:

- ability → `#/ability/intelligence`, using exactly the first five source rows after Intelligence descending, name sort key ascending, then `sourceId` ascending;
- speed → `#/efficiency/speed`, using exactly the first five rows after first-answer latency ascending, name sort key ascending, then `sourceId` ascending, and previewing exact seconds as one inverse blue bar where faster is longer;
- price → `#/efficiency/price`, using exactly the first five rows after output-price descending, name sort key ascending, then `sourceId` ascending, and previewing output price as one amber bar and one exact value;
- advisor → `#/advisor`.

Competition ties do not expand a preview beyond five rows. Home previews do not show rank numerals, remain static, and do not run count-up animation.

## 4. Visual system

### 4.1 Palette

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#050607` | Page background |
| Primary text | `#F5F7FA` | Titles, names, values |
| Directory divider | `#41484E` | Shared home-card grid |
| Ability | `#25DAB0` → `#00DFF1` | Ability card single bars |
| Speed | `#397FE5` → `#0FC4F3` | Home first-answer-latency bars and the first full-view metric |
| Price / secondary | `#FF9D1C` → `#FFD21A` | Home output-price bars and the second full-view metric |
| Advisor | `#9B6CFF` | Advisor card and primary action |
| OpenAI | `#19C37D` | OpenAI model names in full ability views |
| Anthropic | `#D97757` | Anthropic model names in full ability views |
| Google | `#4285F4` | Google model names in full ability views |
| DeepSeek | `#7C6DF2` | DeepSeek model names in full ability views |
| xAI | `#F2C94C` | xAI model names in full ability views |
| GLM | `#00C2FF` | GLM model names in public ranking views |
| KIMI | `#C084FC` | KIMI model names in public ranking views |
| Qwen | `#FF8A3D` | Qwen model names in public ranking views |
| Other creator | `#EC4899` | Every unregistered or null creator name in full ability views |

Muted text is derived from primary text with controlled opacity. Color does not replace a label, unit, selected state, or exact numeric value.

### 4.2 Type

- Display and Chinese UI: local system sans stack headed by `Segoe UI Variable`, `PingFang SC`, and `Microsoft YaHei`.
- Model names and body copy: the same sans family with restrained weight contrast.
- Rank, metric values, prices, dates, and units: `ui-monospace`, `SFMono-Regular`, `Consolas`, monospace with tabular numbers.
- No remote font dependency is required.

### 4.3 Surfaces and spacing

- Black canvas, thin structural rules, and no nested card wall.
- The home directory is a centered wide data canvas: the full-width ability card, shared-edge speed/price row, and full-width advisor form one square-cornered grid; no card floats as a separate rounded panel. Full leaderboard rows use compact whitespace and alignment rather than individual containers or horizontal row dividers.
- On desktop, the home canvas may grow to approximately 1480px so the shared speed/price row retains useful name and bar width. Mobile preserves the card order and stacks all four cards.
- Meaningful text is at least 12px. Touch controls target at least 44px on touch layouts.
- No page-wide scanline, aurora, particle, glowing-border, trophy, podium, or generic purple-blue AI treatment.

## 5. Full ability leaderboard

The page title is `模型能力榜单`. It contains three metric tabs:

- `综合智能` → Artificial Analysis Intelligence Index
- `编程智能` → Artificial Analysis Coding Index
- `智能体能力` → Artificial Analysis Agentic Index

Each tab independently includes every source row with a finite value for that metric. There is no fixed count, Top 20 limit, public-page pagination, or model-family merge. The sync job must still fetch and validate every upstream API page.

Rows contain:

- simplified display name followed by its creator icon;
- score-proportional bar;
- exact numeric score.

Ordering conveys rank; rows do not render visible rank numerals. Competition rank is still computed before filtering and exposed to assistive technology so ties and global position remain unambiguous without adding visual noise.

The chart keeps one vivid cyan/teal gradient for every ability bar. Model-name text receives a stable accent by exact AA creator ID on both home previews and full ability pages: OpenAI green, Anthropic coral, Google blue, DeepSeek indigo, xAI yellow, GLM cyan, KIMI lilac, and Qwen orange. A null or unregistered creator name uses the fallback pink tone; creator names never determine color. The matching fixed creator-filter pill uses that family's 2px accent border, while `全部` uses neutral white. Creator color changes the model name only, never the bar or creator icon; speed and price charts retain their blue/amber metric semantics. Full ability bars are 18px high, square on the left and rounded only on the right, with no dark remainder track. The `0 / 25 / 50 / 75 / 100` axis is the actual fixed ability-index scale: a score of `65.7` fills exactly 65.7% of the plot. Its leftmost zero-origin guide is 2px and visibly higher-contrast than the remaining 1px guides. Every model name occupies the same bounded identity column and is explicitly right-aligned before its icon; an overlong label ellipsizes inside that column instead of protruding. The exact score follows its animated bar endpoint with an 8px gap. Rows use a tighter 44px desktop rhythm. A tab change recalculates order from the selected source metric and replays the data animation. Re-selecting the active tab does nothing.

Full ability rows sort by the selected value descending, name sort key by Unicode code-point order ascending, then `sourceId` ascending. Competition rank uses only the metric value; the other keys stabilize display order without changing ties.

## 6. Speed and price leaderboards

Speed and price are separate detail pages titled `模型速度榜单` and `模型价格榜单`. Their routes do not expose an internal speed/price switch; users choose the destination from the two independent home cards and return home to change leaderboard families.

Every row renders one model identity exactly once. Two legend buttons above each chart map blue and amber to that page's metrics and control ordering. Each button ends with one 16px sort glyph made from two complete vertical strokes: the left upward arrow keeps only the outer-left half of its arrowhead, and the right downward arrow keeps only the outer-right half. The selected metric adopts its metric color and emphasizes only the current direction; both halves remain visible on the inactive metric. To the right of the identity, the two bars start from the same left edge, point in the same direction, and stack vertically in legend order. Five solid vertical guides align both bars; the leftmost zero-origin guide is 2px and visibly higher-contrast than the remaining 1px guides. Each guide label is a compact color-matched `blue value / amber value` pair calculated from the real scale of each metric, rather than a misleading shared 0–100 label. The identity uses the same fixed, right-aligned name-plus-icon columns as the ability page, and only the model name receives its exact creator tone. Both metric bars are 18px high, square on the left and rounded only on the right, with no dark remainder track. Each exact value follows its own animated endpoint with an 8px gap, and two-bar rows use compact spacing without horizontal dividers.

### 6.1 Speed

The metric controls and bar order are:

```text
blue: 首个答案 Token 时间 [sort]   amber: 输出速度 [sort]
模型名称 + 图标   [blue bar  →]
                  [amber bar →]
```

- Both speed axes use a deterministic readable ceiling strictly above the largest observed value. The ceiling is selected from `1 / 1.25 / 1.5 / 2 / 2.5 / 3 / 4 / 5 / 6 / 8 × 10^n` after adding 5% headroom.
- The blue bar encodes first-answer-time desirability as `(ceiling - value) / ceiling`, so lower latency is longer without allowing the fastest observed row to define the endpoint. The exact seconds and `越低越好` label remain visible.
- The amber bar length is linear from zero to the readable output-speed ceiling. If the observed maximum is zero, all rows use the same 2% visual stub and still show `0 tokens/s`.
- Default order is first-answer latency from low to high. Selecting first-answer latency initially sorts low to high; selecting output speed initially sorts high to low. Clicking the active metric toggles its direction.
- Only rows with both required finite values appear.
- Equal active-sort values use the name sort key by Unicode code-point order ascending, then `sourceId` ascending; competition rank uses only the active sort metric and is recomputed before creator filtering.

### 6.2 Price

```text
blue: 输入价格 [sort]   amber: 输出价格 [sort]
模型名称 + 图标   [blue bar  →]
                  [amber bar →]
```

- The blue input-price bar and amber output-price bar start from the same left edge and stack vertically.
- Default order is output price from high to low, as explicitly selected for this product. Selecting either price metric initially sorts high to low; clicking the active metric toggles its direction.
- Each price side independently chooses the same deterministic readable ceiling above its largest observed price, then scales with `log1p(price) / log1p(sideCeiling)` because model prices span a large range and zero is valid. If one side's observed maximum is zero, all rows on that side use the same 2% visual stub and show the exact `$0` value.
- Text always shows the exact linear price; the log scale changes only bar length.
- Only rows with both required finite prices appear. A genuine zero price remains a valid value.
- Equal active-sort prices use the name sort key by Unicode code-point order ascending, then `sourceId` ascending; competition rank uses only the active sort metric and is recomputed before creator filtering.

Changing an efficiency sort does not replay the entry animation. The native sort buttons expose their selected metric and current/next direction to assistive technology and retain a visible keyboard focus state. On mobile, each model remains one compact group: model identity first, then the two same-direction labelled bars and exact values. The page itself must not scroll horizontally.

## 7. Creator filters and ordering

Full leaderboard pages deliberately omit search and result-count summary rows. Ability provides its three centered metric tabs; the independent speed and price pages provide no cross-leaderboard tabs. Every detail page centers its title and visible creator controls; none renders a header description.

Fixed vendor controls are:

`全部 / OpenAI / Anthropic / Google / DeepSeek / xAI / GLM / KIMI / Qwen`

Only these nine fixed controls are exposed; there is no `更多` creator menu. Each outline is 2px. On mobile the controls may scroll horizontally with a visible affordance.

Ranking is computed before creator filtering, so a filtered row keeps its global competition-rank semantics even though rank numerals are not shown visually. Creator-filter changes do not replay chart animation.

## 8. Model identity

`sourceId` is always the row key and identity. A display label is never used for matching, deduplication, or ranking.

Upstream raw name and source slug are stored independently and may be null. At ingestion, formatting-only surrounding whitespace is removed from optional identity text and a blank result becomes null; the required `sourceId` remains strict and is never inferred. The deterministic name sort/display base is `rawName ?? sourceSlug ?? "未命名模型 " + sourceId`. This is a transparent fallback, not an inferred model name; a missing-name row remains visible and is recorded in the sync report.

The visible name is deterministically shortened:

- remove `Adaptive Reasoning`, the word `Effort`, and `Default Fallback`;
- remove a leading `Claude` brand token because the adjacent creator icon already carries that identity;
- retain meaningful effort values such as `Max`, `XHigh`, `High`, and `Medium`;
- abbreviate reasoning/non-reasoning as `R` / `NR` and include it only when it distinguishes otherwise identical labels;
- when an effort label is already present, merge the mode into the same group with a middle dot, for example `High·R` or `High·NR`;
- include a non-default fallback only when needed to avoid a collision;
- if a collision remains, append the shortest distinguishing part of the source slug, or the source ID when the slug is missing.

Example:

`Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)` becomes `Fable 5.1 (Max)`; trailing configuration groups use half-width punctuation so their visible glyph edges share the same right anchor as names without a qualifier.

If two otherwise identical records differ by mode, their visible labels become forms such as `Sonnet 4.6 (High·R)` and `Sonnet 4.6 (High·NR)`. All chart identities stay on one line and use an ellipsis at the available boundary; hovering the name exposes the complete simplified label.

When supplied by AA, the complete substantive raw name remains in the generated record after boundary whitespace normalization for sync validation and evidence, but it is not rendered as a small subtitle. A null raw name remains null.

Nine reviewed AA creator identities use locally stored, appropriately licensed brand SVGs: OpenAI and DeepSeek use their provider marks; Anthropic uses Claude; Google uses Gemini; xAI uses Grok; Z AI uses GLM; Kimi uses its own product mark; Alibaba uses Qwen; and Meta uses its provider mark. Each asset records its source and license, and the complete applicable notice ships at `/THIRD_PARTY_NOTICES.txt`. Every other creator, including a prototype-like ID such as `constructor` or one newly entering a home preview through an automatic data update, uses a circular initial mark and remains fully visible; absence of a bespoke icon never blocks a data refresh.

## 9. Motion

One chart-level progress value drives bars and visible numbers; do not start a separate animation loop for every row.

- First entry into a detail page: bars and numbers grow from zero.
- Switching to a different metric: replay.
- Clicking the active metric: no replay.
- Creator filtering: no replay.
- Home card previews: static.
- Target duration: 600ms with `cubic-bezier(0.22, 1, 0.36, 1)`.
- `prefers-reduced-motion: reduce`: render final values immediately.

Motion never changes sorting, rank, evidence, or the accessible final value.

## 10. Advisor experience

The advisor is a one-shot form, not a chat history.

Visible inputs:

- one large free-form requirement field;
- optional deployment region;
- `我有明确预算` switch;
- when enabled: monthly budget, average input tokens, average output tokens, and monthly request count.

The idle page deliberately keeps its copy sparse. It retains the `MODEL ADVISOR` kicker, title, field labels, placeholders, budget toggle copy, validation errors, and result states, but omits a header description, requirement/deployment helper paragraphs, and service-connection status copy.

Input contracts are explicit:

- requirement text: required, trimmed, 1–2,000 characters;
- deployment region: optional free text, trimmed, at most 64 characters, used only as a verification requirement and never as proof of availability;
- currency: USD;
- monthly budget: finite decimal greater than or equal to zero;
- average input/output tokens: non-negative integers;
- monthly request count: positive integer.

Invalid fields receive an adjacent error and do not start a request.

The default priority when the user does not specify one is:

`capability fit > budget constraint > lower output price > higher output speed`

Explicit requests such as `最便宜`, `最快`, or `最强` take priority. DeepSeek produces a locally validated intent contract, not a ranking. The contract contains an ordered ability-purpose list and at most one promoted objective. General/reasoning/research maps to Intelligence, coding maps to Coding, and tool/automation/Agent work maps to Agentic. Explicitly emphasized purposes retain user order; when no purpose is detected, Intelligence is the default.

```ts
interface ParsedAdvisorNeed {
  abilityPurposes: readonly ('intelligence' | 'coding' | 'agentic')[]
  promotedObjective: 'strongest' | 'fastest' | 'cheapest' | null
  hardRequirements: readonly (
    | 'open_weights'
    | 'api_access'
    | 'tool_use'
    | 'commercial_use'
  )[]
}
```

Unknown fields, duplicate values, unbounded text, URLs, provider/model IDs, and unsupported enum values are rejected. This model-produced object never owns deployment region, budget, or token values. The validated advisor request supplies those form fields separately, and the backend combines them with `ParsedAdvisorNeed` only after both contracts pass local validation. Only the enumerated `hardRequirements`, explicit form-supplied deployment region, and explicit form-supplied budget may eliminate a candidate; an LLM summary or inferred preference cannot.

The deterministic selector then applies these rules:

1. Require a finite value for every explicitly required ability. Explicit `最快` additionally requires output speed; explicit `最便宜` requires output price.
2. When budget is enabled, require both input and output prices and calculate
   `monthly requests × ((average input tokens / 1,000,000 × input price) + (average output tokens / 1,000,000 × output price))`.
   Exclude a row when that cost is missing or exceeds the USD budget.
3. Promote an explicit objective to the first sort key: output price ascending for cheapest, output speed descending for fastest, or the ordered ability tuple descending for strongest.
4. Apply the remaining default keys without duplication: ordered ability tuple descending, lower output price, then higher output speed. Missing non-required values sort last.
5. Stabilize equal rows by the name sort key using Unicode code-point order, then `sourceId` ascending.

The first five rows form the verification pool. DeepSeek server-side web search may inspect only those five. Search preserves their AA-derived order and may remove a candidate only when accepted official evidence explicitly contradicts a hard requirement; missing region evidence is not a contradiction. The final result uses the first three surviving rows as one recommendation plus up to two alternatives. Rows four and five are verification buffers only. If fewer than three survive, return fewer rather than silently adding an unverified sixth candidate.

Deployment region is checked only from accepted official evidence and never inferred from a provider name. A missing region match is marked unverified rather than unsupported.

DeepSeek's Responses `web_search` tool is accessed only through a server-side adapter. Search queries and URL acceptance come from a reviewed `creatorId` source registry, never from a user-provided URL or model-invented domain. A search summary is not evidence until every cited URL passes the registry binding.

Accepted web evidence is limited to:

- the model creator's official site and API/pricing documentation;
- the creator's official GitHub organization;
- Artificial Analysis.

The reviewed registry is `data/aa/official-sources.json` and follows this minimum shape:

```json
{
  "schemaVersion": 1,
  "artificialAnalysis": [
    {
      "host": "artificialanalysis.ai",
      "allowSubdomains": true,
      "pathPrefix": "/"
    }
  ],
  "creators": [
    {
      "creatorId": "example-creator",
      "sources": [
        {
          "kind": "official_site",
          "host": "example.com",
          "allowSubdomains": false,
          "pathPrefix": "/"
        },
        {
          "kind": "official_github",
          "host": "github.com",
          "allowSubdomains": false,
          "pathPrefix": "/example-org/"
        }
      ]
    }
  ]
}
```

Registry validation rejects unknown fields, duplicate `creatorId` values, non-ASCII registry hosts, non-HTTPS citation URLs, credentials, non-default ports, fragments, and ambiguous GitHub organization paths. Citation hosts are normalized through IDNA to lowercase ASCII and matched exactly; subdomains are accepted only when `allowSubdomains` is true and the dot boundary is preserved. Every redirect hop, final citation URL, and GitHub first path segment must revalidate against the same candidate creator binding. A missing/unregistered creator can still use AA facts but cannot receive `已完成实时核验`. Registry/schema changes require human review.

The result contains:

- one highlighted recommendation;
- relevant ability, price, and speed values;
- one short reason;
- a collapsed `查看依据` section;
- a collapsed `查看另外 2 个备选` section;
- a visible live-verification or AA-only fallback state.

Every absent value is rendered as `暂无 AA 数据`, never zero. A candidate missing an explicitly required core metric cannot be described as a complete match.

The verification state is one of:

- `已完成实时核验`: every supplemental claim used in the primary recommendation has accepted current official evidence;
- `部分来源未核验`: search completed and at least one accepted official source was found, but one or more displayed supplemental claims are marked unverified;
- `实时资料未完成核验`: no usable live verification completed, so the result contains only deterministic AA facts and says `仅依据 AA`.

The UI does not show event rails, tool calls, trace IDs, raw graph states, exact-version diagnostic consoles, or update proposals. Existing backend explain/update abilities may remain available outside the ordinary UI.

The public transport is one non-streaming JSON endpoint, `POST /api/v1/advisor/recommend`. Client cancellation aborts the request; all provider operations have finite time and response bounds. Invalid input returns the normal validation 4xx response. The sixth request from one IP within 10 minutes returns 429 with `Retry-After`. If both global web-search slots are occupied, or the provider/search fails, the endpoint returns HTTP 200 with the deterministic AA result labelled `实时资料未完成核验`; it does not queue indefinitely or expose an SSE trace.

Zeabur remains fixed at one replica and one Uvicorn worker, so the in-process limit is service-wide for this deployment. Increasing either count is blocked until a shared limiter is designed and reviewed.

## 11. Footer

The footer appears on the home page only and contains only:

- GitHub icon linking to `https://github.com/joker01-01`;
- Bilibili icon linking to `https://space.bilibili.com/691663896`;
- WeChat official-account icon for `23号切片`;
- `数据来源：Artificial Analysis · 更新日期：<AA observedAt>`.

The social row renders the three icons without a `WS` wordmark or bare URLs. Every icon has an accessible name. Pointer hover or keyboard focus on the WeChat control reveals the locally bundled user-provided QR image in a non-modal popover. The popover contains only the QR image: no visible account label, scan hint, close control, or native `title` tooltip.

The update date is the AA snapshot observation date, not the deployment date. A failed refresh therefore leaves the previous date visible.

## 12. Responsive and accessibility requirements

- Desktop: one full-width ability card, one shared-edge speed/price row, one full-width advisor row, and same-direction stacked metric bars on the full efficiency page.
- Mobile: four stacked home cards; each full efficiency row keeps one model identity followed by two vertically stacked metric bars; 16px page gutter.
- Verify at 1440×900, 1024×768, 768×1024, 430×932, 390×844, and 320×568.
- No page-level horizontal overflow at 390px or 200% zoom.
- Use landmarks, a continuous heading order, keyboard-operable cards/tabs/filters, visible focus, and explicit selected state.
- Bars are decorative only when adjacent text exposes the exact model, metric, value, and unit.
- Empty and failure states say what is unavailable and what still works.
- The WeChat control has a concise non-visual accessible name; its decorative popover image does not duplicate that announcement.

## 13. Source data and refresh boundary

The public snapshot has one top-level contract containing:

- repository schema version;
- exact AA source URL;
- observation date;
- AA Intelligence Index version plus a fingerprint of the selected Free v2 wire-contract projection needed to detect semantic changes; Coding and Agentic are derived indices and have no separate AA version field;
- the documented caller tier (`free`, `pro`, or `commercial`) is checked for consistency across pages but is not published because the `/language/models/free` response projection is the same;
- upstream pagination proof: page size, total pages, nullable declared total rows, and fetched row count;
- the normalized model collection.

Each model record stores:

- required `sourceId`; nullable `sourceSlug`, raw name, creator ID/name, and release date; and the observation date;
- nullable finite Intelligence, Coding, and Agentic values;
- nullable finite, non-negative input/output prices;
- nullable finite, non-negative first-answer time and output speed.

`sourceId` must be non-empty and unique. Ability values must satisfy the inspected AA contract; performance and price cannot be negative, while a zero price is valid. The TypeScript snapshot and backend JSON are serialized from the same validated in-memory object and must pass a semantic-equivalence test.

The public artifacts are isolated from the legacy curated snapshot: `src/data/generated/aaPublicSnapshot.ts` exports `AA_PUBLIC_SNAPSHOT`, `data/aa/generated/snapshot.json` is the backend-readable equivalent, and `data/aa/generated/sync-report.json` records pagination, schema, coverage, and missing identity text. The Phase 2 public-only sync mode writes only those three files; it cannot run Arena or rewrite legacy AA, combined-report, or ModelOps generated data.

Duplicate IDs, non-finite/invalid values, incomplete pagination, contract/index/methodology changes, or a catastrophic row/metric drop block publication. AA's current Free v2 pagination does not declare a total row count, so completeness is proven from every page plus `has_more`, and `fetchedRowCount` is the total used for baseline comparisons; `declaredTotalRows` remains null under schema version 1, and any future upstream total-row field requires a reviewed schema change before use. The first full-snapshot PR is always human reviewed. Later same-schema PRs compare fetched total rows and the seven independent finite-value row counts against current `main`; for each nonzero base count, `headCount < baseCount * 0.8` blocks, so exactly 20% is allowed and a greater drop is not. A zero base count skips only that percentage comparison. Ordinary source model additions/removals and metric value/date/order changes may otherwise auto-merge when generated-file allowlists, data contracts, curated-evidence regressions, tests, and build all pass. Code, workflow, documentation, source-registry/mapping, or structural changes remain subject to human review.

## 14. Explicit exclusions

- No default leaderboard on the home page.
- No Top 20 or source-total title copy.
- No curated editorial board entry in the new public navigation.
- No model-family merging.
- No public-page pagination; the sync job still consumes every upstream API page.
- No user accounts, saved conversations, database, or recommendation history.
- No client-side DeepSeek or AA keys.
- No unregistered or non-official search results as recommendation evidence; AA and registry-bound official creator/GitHub sources are the only exceptions.
- No visible technical Agent console.
- No new router, chart, animation, UI framework, or state-management dependency.

## 15. Design acceptance

The design is accepted only when the implemented page follows this information architecture, every chart is driven by validated source data, the full and simplified identities remain correctly separated, mobile and reduced-motion behavior are complete, and the advisor can visibly distinguish live verification from AA-only fallback.
