# LangGraph orchestrator — showcase guide

Use this for **Jun 14 demo rehearsal**, Q&A, and deck talking points.

## Demo flow (recommended order)

1. **`/orchestrator`** — show LangGraph topology (Mermaid + node chips)
2. **`pnpm demo`** — step 1 + 1b demonstrates HITL interrupt + resume
3. **Review queue** — human override learning loop (steps 4–6)
4. **Transaction detail** — LangGraph step timeline under **Why**
5. **MCP** — `ingest_transaction` + optional `approve_auto_tag`

## Four orchestration pillars (what to say)

| Pillar | What we built | One-liner |
|--------|---------------|-----------|
| **LangGraph** | Explicit nodes for policy → tagging → persist | “Workflow is a graph, not nested awaits” |
| **Postgres checkpoints** | `PostgresSaver` keyed by `run_id` | “Runs survive restarts; thread_id = run_id” |
| **HITL interrupt** | `awaitAutoTagApproval` + `Command({ resume })` | “AUTO_TAG pauses until a human approves” |
| **Observability** | `graph_steps` in audit + `/orchestrator` | “Every node is traced with latency” |

## Environment

```bash
# .env
AUTO_TAG_HITL_ENABLED=true          # global default for ingest API
LANGGRAPH_CHECKPOINTER=postgres   # use memory for unit tests

pnpm db:setup-checkpointer          # once — creates checkpoint tables
```

Eval and `pnpm verify` use `skipHitl: true` so batch runs do not pause.

## Q&A cheat sheet

**Why LangGraph now?**  
We wanted explicit nodes, conditional AP branching, checkpointing, and in-graph HITL — without agents calling agents.

**Where is HITL?**  
Two layers: (1) **in-graph** interrupt before AUTO_TAG persist; (2) **review queue** for QUEUE_REVIEW / REFUSE + override learning.

**Why not interrupt on every decision?**  
Only AUTO_TAG auto-posts to ERP (mock). Review/refuse already route to humans via review queue.

**Postgres vs Memory checkpointer?**  
Postgres for dev/demo persistence; memory in unit tests (`LANGGRAPH_CHECKPOINTER=memory`).

## Verify before showcase

```bash
pnpm db:setup-checkpointer
pnpm test
pnpm eval:tagging
pnpm demo
pnpm dev   # /orchestrator + /review-queue
```
