> 历史归档：以下内容保留实施前的方案和当时状态，不代表当前功能或发布情况。当前设计见 [DESIGN.md](../../DESIGN.md)，当前状态见 [PROJECT_STATE.md](../../PROJECT_STATE.md)。

# ModelOps Agent Reuse Assessment

Assessed on 2026-09-02 before implementation. The goal was to find a reusable FastAPI + LangGraph + SSE or model-selection project without importing unrelated platform scope.

## Candidate comparison

| Candidate | Maintenance evidence | License | Useful parts | Why it is not the base |
| --- | --- | --- | --- | --- |
| [simple-sse-agent](https://github.com/johnkitaoka/simple-sse-agent) | 2 commits, 0 stars, no release | MIT | Minimal React/FastAPI/LangGraph SSE shape | Example-level implementation with a GET query stream and no typed evidence, verifier, failure contract, or evaluation boundary |
| [MakFly/langchain-poc](https://github.com/MakFly/langchain-poc) | 5 commits, 0 stars; README explicitly calls it an unmaintained proof of concept | MIT | Typed SSE protocol separation and deterministic evaluation ideas | Brings PostgreSQL, RAG, assistant-ui, MCP, persistence, Docker and a different product/data model |
| [langgraph-fastapi-starter](https://github.com/IgnazioDS/langgraph-fastapi-starter) | 6 commits, 2 stars | Portfolio-viewing license; copying and derivative use prohibited | Clear API/service/graph layering | Cannot be reused under its license and adds PostgreSQL, pgvector, auth and migrations outside this MVP |
| [AgentOptimizer/agentopt](https://github.com/AgentOptimizer/agentopt) | v0.1.0 released in 2026; about 87 stars | Apache-2.0 | Cost/latency measurement and evaluation concepts | Optimizes model combinations by intercepting LLM traffic; it does not provide exact-version catalog evidence, missing-data explanations, or human-reviewed update proposals |

## Decision

Build the bounded feature inside this repository instead of directly using or forking a candidate.

The reusable unit is the design pattern, not a copied application:

- keep FastAPI transport separate from graph/domain logic;
- use a typed SSE event envelope;
- inject a fake model gateway for deterministic evaluations;
- keep optional production infrastructure out until a measured need exists.

No source code from the assessed repositories will be copied. In particular, the portfolio-viewing starter is reference-only because its license prohibits reuse.

## Smallest implementation path

1. Export the existing exact-version catalog and benchmark evidence into deterministic JSON for Python.
2. Implement five project-specific typed tools and their error contracts.
3. Assemble a bounded LangGraph with deterministic routing/verifier decisions.
4. Expose POST SSE plus a non-streaming evaluation endpoint through FastAPI.
5. Add one focused React panel and verify the original leaderboard remains independently usable.

The user has already approved the repository-specific architecture and explicitly requested staged implementation, so this assessment does not introduce another confirmation gate.
