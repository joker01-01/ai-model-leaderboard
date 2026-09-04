# Zeabur backend deployment

## Decision and scope

Deploy the existing stateless FastAPI service to a Zeabur-managed Tencent Cloud server in Singapore. The selected server has 2 vCPU, 2 GB RAM, 40 GB SSD, and 512 GB monthly outbound transfer. The React site remains on GitHub Pages.

```text
GitHub Pages
  -> HTTPS POST /api/v1/agent/query (SSE)
  -> Zeabur / Tencent Cloud Singapore
  -> FastAPI + LangGraph
  -> DeepSeek Responses API and exact-allowlisted provider documents
```

This deployment does not add persistence, replay, authentication, data writes, automatic merge, or automatic publication. `prepare_data_update` remains a review-only proposal operation.

## Current deployment

- Service: `modelops-agent-api`
- Source: GitHub `main`, built with the root-level `Dockerfile`
- Public origin: `https://modelops-agent-api.zeabur.app`
- Verified on 2026-09-04: readiness, a live DeepSeek-backed invoke, POST SSE, and the GitHub Pages CORS preflight passed. The observed runtime logs showed no out-of-memory event or process restart during acceptance.

## Repository layout requirement

Use the repository root as the Docker build context. Do not set the Zeabur service Root Directory to `backend/`.

The runtime imports Python from `backend/app/`, while `LeaderboardRepository.load()` resolves and reads:

```text
data/modelops/generated/catalog.json
data/modelops/generated/evidence.json
```

The root-level `Dockerfile` preserves both paths in the image and starts Uvicorn from the container's `backend/` directory. Zeabur injects `PORT`; do not define or override it in the service variables.

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
MODELOPS_MODEL_TIMEOUT_SECONDS=30
MODELOPS_PROVIDER_DOCUMENT_TIMEOUT_SECONDS=10
MODELOPS_PROVIDER_DOCUMENT_MAX_BYTES=1000000
MODELOPS_SSE_HEARTBEAT_SECONDS=15
MODELOPS_GRAPH_RECURSION_LIMIT=32
```

`MODELOPS_CORS_ORIGINS` contains origins only, so the GitHub Pages repository path must not be appended.

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

A `503` response means the API key, generated JSON, or startup dependency is unavailable. Do not route frontend traffic to that deployment.

### 3. Non-streaming live request

```powershell
curl.exe --fail --show-error `
  --header "Content-Type: application/json" `
  --data '{"message":"Recommend a coding model using verified evidence."}' `
  "$ApiOrigin/api/v1/agent/query:invoke"
```

Acceptance requires a schema-valid response from the configured DeepSeek gateway with `answer.status` equal to `completed` for this recommendation smoke. Missing evidence must remain explicit and a proposal must remain `awaiting_human_review`.

### 4. POST SSE

```powershell
curl.exe --no-buffer --fail --show-error `
  --header "Accept: text/event-stream" `
  --header "Content-Type: application/json" `
  --data '{"message":"Recommend a coding model using verified evidence."}' `
  "$ApiOrigin/api/v1/agent/query"
```

Verify all of the following:

- the response is streamed instead of buffered until completion;
- event `sequence` values increase monotonically;
- a heartbeat comment arrives only if no application event is emitted for the configured 15-second interval; a faster run does not need one;
- exactly one terminal event is emitted, and this recommendation smoke ends with `run.completed`;
- closing the client connection cancels unfinished server work;
- a complete run finishes within the configured model/document timeouts without the gateway terminating the stream.

### 5. Browser boundary

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

The public API currently has no authentication or rate limiting. CORS constrains browsers but does not prevent direct scripted requests. Expose the backend only through the reviewed Pages build and do not widen the configured browser origins without a separate review. Keep only a controlled small DeepSeek balance and review Usage regularly; enable an alert or quota only if the provider console explicitly offers it. Adding application authentication or rate limiting requires a separately approved scope.

## Rollback

If build, readiness, or live SSE acceptance fails:

1. Keep the GitHub Pages frontend disconnected from the Agent API.
2. Inspect the Zeabur build and runtime logs without copying environment values.
3. Open **Deployments**, select the last healthy deployment, and choose **Rollback**. A rollback restores the built image but not environment-variable changes, so restore incorrect variables separately. If no healthy deployment exists yet, suspend only the new service while fixing it.
4. Reconcile `main` through a reviewed revert or fix commit; do not edit generated JSON or application code inside the running container.

There is no database or persistent migration to reverse.

## Zeabur references

- [Deploying with Dockerfile](https://zeabur.com/docs/en-US/deploy/methods/dockerfile)
- [GitHub integration](https://zeabur.com/docs/en-US/deploy/methods/github-integration)
- [Environment variables](https://zeabur.com/docs/en-US/deploy/config/environment-variables)
- [Custom health checks](https://zeabur.com/docs/en-US/monitoring/health-checks)
- [Deployment rollbacks](https://zeabur.com/docs/en-US/operations/deployment/rollbacks)
