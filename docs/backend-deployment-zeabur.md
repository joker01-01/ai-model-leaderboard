# Zeabur backend deployment

## Decision and scope

Deploy the existing stateless FastAPI service to a Zeabur-managed Tencent Cloud server in Singapore. The selected server has 2 vCPU, 2 GB RAM, 40 GB SSD, and 512 GB monthly outbound transfer. The React site remains on GitHub Pages.

```text
GitHub Pages
  -> HTTPS POST /api/v1/advisor/recommend (one-shot JSON)
  -> Zeabur / Tencent Cloud Singapore
  -> FastAPI + LangGraph
  -> deterministic AA selection + DeepSeek intent / optional no-search notes
```

The public Advisor never enables `web_search`, performs a provider continuation, or fetches citation URLs. It may still make remote DeepSeek API calls, so no web search does not mean a fully offline deployment. The legacy `/api/v1/agent/query` SSE endpoint and its separate reviewed document-evidence path remain supported alongside the public advisor. Neither path adds persistence, replay, authentication, or data writes. `prepare_data_update` remains a review-only proposal operation. The advisor must remain at one replica and one Uvicorn worker while its per-IP and provider-note limits are in process; verify trusted-proxy CIDRs before trusting forwarded client IPs.

## Current deployment

- Service: `modelops-agent-api`
- Source: GitHub `main`, built with the root-level `Dockerfile`
- Public origin: `https://modelops-agent-api.zeabur.app`
- Runtime baseline: `4b9e5f3` from PR #37, verified in Zeabur deployment `deployment-6a9cc58caad15df0678d3f30` on 2026-09-06.
- Readiness and a bounded advisor request passed on that search-era baseline. The request returned a schema-valid `aa_only` result, but this deployment predates the no-search design and does not prove that `tool_choice: "none"` or the unreachable legacy search gateway is active in production. Deploy and smoke-test the new merged revision before making that claim.

## Repository layout requirement

Use the repository root as the Docker build context. Do not set the Zeabur service Root Directory to `backend/`.

The runtime imports Python from `backend/app/`, while `LeaderboardRepository.load()` resolves and reads:

```text
data/modelops/generated/catalog.json
data/modelops/generated/evidence.json
data/aa/generated/snapshot.json
```

The root-level `Dockerfile` preserves these paths in the image and starts Uvicorn from the container's `backend/` directory. It also currently preserves `data/aa/official-sources.json` for compatibility code, but the public Advisor must not load or consult that registry. The container loads `backend/logging.json`, which preserves Uvicorn's default access/error logging and adds an INFO handler for `app.*`; ordinary unconfigured library INFO events still inherit the root WARNING threshold. Zeabur injects `PORT`; do not define or override it in the service variables.

## Zeabur project setup

The existing service already uses this configuration. Keep these steps as the recreation and redeployment runbook.

1. Commit and push the root `Dockerfile`, `.dockerignore`, and this runbook to `main`.
2. Open the purchased server and select **Projects**.
3. Create a project on that existing server. A suitable name is `ai-model-leaderboard`.
4. Add a service from GitHub and select `joker01-01/ai-model-leaderboard`.
5. Name the service `modelops-agent-api` and select the `main` branch.
6. Leave Root Directory empty so the repository root is the build context.
7. Confirm that Zeabur detects the root-level `Dockerfile`.
8. Configure the environment variables below before exposing a public domain.
9. In the service settings, set the custom HTTP health-check path to `/healthz`.
10. Redeploy after saving the variables if the automatic initial deployment already started.
11. Generate a Zeabur HTTPS domain only after the deployment becomes healthy.

Zeabur's GitHub integration starts the initial deployment and redeploys on every push to the linked branch by default. Keep the service linked to `main`; the human merge to `main` remains the backend release gate.

Use the generated HTTPS domain for application traffic. Do not configure the frontend against the server's direct IPv4 address or record that address in the repository.

Do not configure watch paths that include only `backend/**`: changes under `data/modelops/generated/**` must also rebuild the image. Leaving watch paths unset is the safest initial configuration.

## Environment variables

Configure these in the Zeabur service dashboard. Never store the real API key in Git, a Docker build argument, a Docker image, or deployment documentation.

```dotenv
MODELOPS_MODEL_API_KEY=<DeepSeek API key>
MODELOPS_MODEL_NAME=deepseek-v4-flash
MODELOPS_MODEL_BASE_URL=https://api.deepseek.com
MODELOPS_CORS_ORIGINS=https://joker01-01.github.io
MODELOPS_MODEL_TIMEOUT_SECONDS=60
MODELOPS_MODEL_MAX_RESPONSE_BYTES=1000000
MODELOPS_PROVIDER_DOCUMENT_TIMEOUT_SECONDS=10
MODELOPS_PROVIDER_DOCUMENT_MAX_BYTES=1000000
MODELOPS_SSE_HEARTBEAT_SECONDS=15
MODELOPS_GRAPH_RECURSION_LIMIT=32
MODELOPS_TRUSTED_PROXY_CIDRS=
```

`MODELOPS_CORS_ORIGINS` contains origins only, so the GitHub Pages repository path must not be appended.

Keep `MODELOPS_MODEL_TIMEOUT_SECONDS` at 60 for the production advisor's remote intent and optional knowledge-note calls. The new no-search path still needs bounded provider time; remeasure its actual latency after deployment rather than reusing the former web-search timing as proof.

`MODELOPS_MODEL_API_KEY` is required for the legacy Agent and for public-Advisor intent parsing and optional model-knowledge notes. Without it, the runtime deliberately keeps deterministic AA-only Advisor output available while provider-backed steps degrade; `/healthz` does not validate provider credentials. The configured DeepSeek base URL therefore still requires outbound HTTPS even though the public Advisor performs no web search or URL retrieval. Keep `MODELOPS_TRUSTED_PROXY_CIDRS` empty until Zeabur's exact forwarding networks have been reviewed, and never use a catch-all CIDR merely to enable forwarded client IPs.

Do not add `AA_API_KEY`; it belongs to the separate data-sync workflow. `VITE_AGENT_API_URL` is injected only into the reviewed GitHub Pages build and is not a backend service variable.

## Deployment acceptance

Use the generated Zeabur HTTPS origin as `$ApiOrigin` in PowerShell:

```powershell
$ApiOrigin = "https://modelops-agent-api.zeabur.app"
```

### 1. Browser landing

Open `$ApiOrigin` in a browser, or inspect the response directly:

```powershell
curl.exe --include --fail --show-error "$ApiOrigin/"
```

An available runtime returns HTTP 200 with `content-type: text/html`, an `ok` status marker, and links to the public leaderboard, `/docs`, and `/healthz`. An unavailable runtime returns the same bounded page with HTTP 503 and no startup-error details. Keep Zeabur's automated health probe on `/healthz`; the root page is the human-facing service boundary.

### 2. Readiness

```powershell
curl.exe --fail --show-error "$ApiOrigin/healthz"
```

Expected response:

```json
{"status":"ok"}
```

A `503` response means generated JSON or another required startup dependency is unavailable. A `200` response proves repository-backed runtime readiness only: the service can return deterministic AA-only Advisor results without a model key, so readiness does not prove that remote DeepSeek intent parsing or optional knowledge notes work.

### 3. Non-streaming live request

```powershell
curl.exe --fail --show-error `
  --header "Content-Type: application/json" `
  --data '{"message":"Recommend a model for Python coding. Provider region is cn-beijing. Monthly budget is 10 USD. Each request uses 1000 uncached input tokens, 0 cached input tokens, and 500 output tokens. There are 100 requests per month. Evaluate as of 2026-09-05."}' `
  "$ApiOrigin/api/v1/agent/query:invoke"
```

Acceptance requires a schema-valid response from the configured DeepSeek gateway with `answer.status` equal to `completed` for this recommendation smoke. Missing evidence must remain explicit and a proposal must remain `awaiting_human_review`.

### 4. POST SSE

```powershell
curl.exe --no-buffer --fail --show-error `
  --header "Accept: text/event-stream" `
  --header "Content-Type: application/json" `
  --data '{"message":"Recommend a model for Python coding. Provider region is cn-beijing. Monthly budget is 10 USD. Each request uses 1000 uncached input tokens, 0 cached input tokens, and 500 output tokens. There are 100 requests per month. Evaluate as of 2026-09-05."}' `
  "$ApiOrigin/api/v1/agent/query"
```

Verify all of the following:

- the response is streamed instead of buffered until completion;
- event `sequence` values increase monotonically;
- a heartbeat comment arrives only if no application event is emitted for the configured 15-second interval; a faster run does not need one;
- exactly one terminal event is emitted, and this recommendation smoke ends with `run.completed`;
- closing the client connection cancels unfinished server work;
- a complete run finishes within the configured model/document timeouts without the gateway terminating the stream.

### 5. Public Advisor no-search boundary

After the no-search revision is deployed, submit one bounded Advisor request:

```powershell
$AdvisorBody = @{
  requirement = "需要综合能力强并支持 API 调用的模型"
  deployment_region = $null
  budget = $null
} | ConvertTo-Json

$Advisor = Invoke-RestMethod `
  -Method Post `
  -Uri "$ApiOrigin/api/v1/advisor/recommend" `
  -ContentType "application/json" `
  -Body $AdvisorBody

$Candidates = @($Advisor.recommendation) + @($Advisor.alternatives)
$Advisor | Select-Object verification_status, citations, rejections
$Candidates | Select-Object source_id, reason, verification_status, checks
```

Acceptance requires HTTP 200 and the following invariant for both provider-enriched and fallback responses:

- top-level `verification_status` is exactly `aa_only`;
- every returned candidate has `verification_status = "aa_only"` and `checks = []`;
- top-level `citations = []` and `rejections = []`;
- candidate membership, metrics, calculated cost, and order come only from the committed AA snapshot and deterministic selector;
- any provider-added note is prefixed `模型知识参考（未联网核验）`, contains no URL, and makes no verified hard-requirement or deployment-region claim.

An absent note is a valid deterministic fallback and does not by itself identify whether the key was absent, both note-call slots were occupied, the provider failed, or provider output failed strict validation. Inspect only bounded failure-category and duration logs when diagnosis is needed; never log the user requirement, model note, provider body, or key.

The live response proves the public wire boundary, not the exact provider request body. Before deployment, injected transport tests must prove that both Advisor requests explicitly send `tool_choice: "none"`, omit `tools`, `include`, `previous_response_id`, and restored response items, reject tool calls and URLs, and never call the preserved `DeepSeekAdvisorGateway`. Do not accept production `partial`/`verified` results or non-empty evidence arrays as a compatibility success; they violate the no-search design.

### 6. Browser boundary

Check the browser preflight explicitly:

```powershell
curl.exe --include --request OPTIONS `
  --header "Origin: https://joker01-01.github.io" `
  --header "Access-Control-Request-Method: POST" `
  --header "Access-Control-Request-Headers: content-type" `
  "$ApiOrigin/api/v1/agent/query"
```

The response must include `access-control-allow-origin: https://joker01-01.github.io`. Also verify:

- The deployment used the intended `main` commit and Zeabur's Dockerfile builder.
- Build and runtime logs contain no `agent_runtime_unavailable` event and do not expose environment values.
- The existing static leaderboard still loads when no Agent API URL is configured.
- A server restart or deployment rollback restores `/healthz` without persistent state or migration work.
- The service remains stable during one live Agent run without an out-of-memory restart.

### Recorded live result

On 2026-09-04, landing-page commit `a80321b` passed GitHub Verify run `33838256321` and Pages run `33838256266`. Zeabur redeployed it from `main`; the public root changed from FastAPI's HTTP 404 JSON to HTTP 200 `text/html`, reported `data-status="ok"`, linked the public leaderboard, `/docs`, and `/healthz`, and sent `Cache-Control: no-store`. The public `/healthz` endpoint remained HTTP 200.

The deployed `main` service also passed a DeepSeek-backed `query:invoke`, POST SSE, and the GitHub Pages CORS preflight. The published Pages HTML and JavaScript returned HTTP 200, and the live browser DOM contained both the API-configured Evidence Console and the existing leaderboard. The observed runtime logs showed no OOM event or restart during these checks.

HTTPS transport checks carrying the production Pages `Origin` header covered all three Agent paths. The constrained recommendation emitted 15 monotonically sequenced events and one `run.completed`; exact-version explanation emitted 10 events with an exact resolution and one terminal event; the review-only update emitted 10 events including `proposal.ready` and ended `awaiting_human_review` without writing data. Together with the live DOM inspection, this verifies the published artifact and its production HTTP/CORS boundary; broad automated click-through coverage remains a separate frontend test scope.

A separate disconnect check uploaded a complete valid request, received HTTP 200 plus `run.started` sequence 1 and `node.started` sequence 2, then intentionally closed the client transport after about 1.511 seconds. The immediate health check still returned HTTP 200. During the following 603.4 seconds, 20/20 health checks succeeded (average 1.172 seconds, minimum 1.094, maximum 1.322), and the invoke checks before and after the window both returned HTTP 200 with a completed answer.

This proves client transport disconnection and post-disconnect service readiness; it does not prove from online logs that the server-side graph task was cancelled. Internal task cancellation is verified offline by `backend/tests/integration/test_api.py::test_client_disconnect_cancels_an_unfinished_graph_run`. The ten-minute result is bounded endpoint stability, not a sustained-load or long-duration resource test.

A production Git-revert drill then moved `main` from Phase D commit `ec65297` to rollback commit `2226205`. GitHub Verify and Pages both passed, Zeabur showed the rollback revision as `Running`, 12 consecutive health checks remained HTTP 200 through the switch, and a complete recommendation SSE emitted sequence 1 through 15 with exactly one `run.completed`. Recovery commit `bb9e31e` reapplied Phase D; its Verify and Pages workflows passed, Zeabur showed the recovery revision as `Running`, another 12 health checks remained HTTP 200, and the post-recovery recommendation SSE completed with 27 monotonically sequenced events and one terminal event. Commit `ec65297` changed no files under `backend/`, `Dockerfile`, or `data/modelops/`, so the drill validates GitHub-to-Zeabur revision switching, health continuity, and recovery rather than rollback between different backend implementations.

After recovery, the Zeabur 12-hour Usage graph showed low-single-digit CPU percentages and service memory around 65-75 MB for the single replica. Network metrics were unavailable for the dedicated server. This is a control-plane snapshot around bounded acceptance traffic, not a sustained-load test or a whole-server capacity measurement.

## Cost boundary

The purchased server is a fixed monthly resource. Start with one service and one Uvicorn worker. Observe CPU and memory before adding replicas or increasing limits.

The public API has no authentication. CORS constrains browsers but does not prevent direct scripted requests. The Advisor enforces five requests per client IP per ten minutes and allows at most two simultaneous optional knowledge-note calls in its single process; intent parsing happens before that provider gate but remains bounded by the per-IP window and provider timeout. The preserved legacy Agent endpoints do not gain that limiter. Keep one Zeabur replica and one Uvicorn worker until a reviewed shared limiter exists, and configure only exact trusted proxy CIDRs before relying on forwarded client IPs. Expose the backend only through the reviewed Pages build, do not widen the configured browser origins without a separate review, keep a controlled small DeepSeek balance, and review provider usage regularly.

## Rollback

If build, readiness, or live SSE acceptance fails:

1. Keep the GitHub Pages frontend disconnected from the Agent API.
2. Inspect the Zeabur build and runtime logs without copying environment values.
3. Open **Deployments**, select the last healthy deployment, and choose **Rollback**. A rollback restores the built image but not environment-variable changes, so restore incorrect variables separately. If no healthy deployment exists yet, suspend only the new service while fixing it.
4. Reconcile `main` through a reviewed revert or fix commit; do not edit generated JSON or application code inside the running container.

There is no database or persistent migration to reverse.

## DeepSeek and Zeabur references

- [DeepSeek Responses API compatibility](https://api-docs.deepseek.com/guides/responses_api/)
- [DeepSeek Responses API reference](https://api-docs.deepseek.com/api/create-response/)
- [Deploying with Dockerfile](https://zeabur.com/docs/en-US/deploy/methods/dockerfile)
- [GitHub integration](https://zeabur.com/docs/en-US/deploy/methods/github-integration)
- [Environment variables](https://zeabur.com/docs/en-US/deploy/config/environment-variables)
- [Custom health checks](https://zeabur.com/docs/en-US/monitoring/health-checks)
- [Deployment rollbacks](https://zeabur.com/docs/en-US/operations/deployment/rollbacks)
