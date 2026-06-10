# Production at Scale — From Capstone to Enterprise

> **Audience:** Interview prep, senior AI engineer discussions, and “what happens after the POC.”  
> **Capstone build (Jun 10):** [Hero spec §12](./superpowers/specs/2026-05-28-tagging-mini-product-design.md#12-production-ai-engineering-layer) + [§12.9 scale-ready hooks](./superpowers/specs/2026-05-28-tagging-mini-product-design.md#129-scale-ready-hooks-implement-now-not-later).  
> **This doc:** Full scaling narrative for interviews; infrastructure sections below are **defer** unless listed in the implement-now table.

This is where the project becomes interesting.

Right now, most people can explain:

```text
LLM
RAG
Agents
```

Very few can explain:

```text
Production
Scaling
Reliability
Cost
Operations
```

And that's exactly what senior AI interviews increasingly focus on.

---

## Implement now vs defer (capstone build)

Use this table when scoping **May 28 – Jun 10** work. **Implement now** = in code/schema before freeze. **Defer** = document in `docs/architecture.md` + discuss in interviews.

| # | Production theme | Implement now (Jun 10) | Defer (post-demo) |
|---|------------------|------------------------|-------------------|
| 1 | **Latency / async** | `processing_status` on transactions; stateless API | Kafka / SQS / worker pools |
| 2 | **Rate limits** | Central LLM client; 429 exponential backoff | Queue + backpressure workers |
| 3 | **Cost** | Rule-first skip LLM; token/cost audit; `llm_skipped_reason`; eval metric `llm_calls_saved_by_rules` | Budget alerts, CFO dashboards |
| 4 | **DB scaling** | `tenant_id` indexes; idempotent ingest | Table partitioning by time/tenant |
| 5 | **Vector scaling** | pgvector, tenant-scoped retrieval | Qdrant / Weaviate / retrieval cluster |
| 6 | **Multi-tenant isolation** | `tenant_id` on every row and query; unique vendor rules per tenant | Row-level security, shard-by-tenant |
| 7 | **Observability** | Step traces in `audit_log`; `run_id` replay in UI/CLI | Jaeger, Langfuse, OTel export |
| 8 | **Reliability** | Zod fail → review; LLM outage → `QUEUE_REVIEW`; optional 1-retry escalation | Multi-provider router, full fallback chain |
| 9 | **Eval drift** | `pnpm eval:tagging`; calibration bins; `prompt_version` / `eval_set_version` | CI regression gate; continuous prod evals |

**Rule of thumb:** if it fits in schema + orchestrator + LLM client + eval script, **implement now**. If it needs new infrastructure, **defer and document**.

The sections below walk through each problem in depth. Cross-reference the table above when reading — e.g. Problem #1 async workers are **defer**; `processing_status` is **implement now**.

---

## Current Architecture (Capstone Scale)

Today your architecture looks like:

```text
Client
  ↓
NextJS API
  ↓
Orchestrator
  ↓
Policy
  ↓
Retrieval
  ↓
LLM
  ↓
Decision
  ↓
Postgres
```

Perfect for:

```text
100
1000
5000
transactions/day
```

No issues.

---

## Imagine Success

Now imagine your product gets adopted.

You have:

```text
10,000 tenants

100 transactions/day

per tenant
```

Total:

```text
1,000,000 transactions/day
```

Suddenly everything changes.

---

## Problem #1 — Latency

Current flow:

```text
Transaction
 ↓
Policy        20ms
Retrieval     50ms
LLM           1500ms
Decision      5ms
```

Total:

```text
~1.6 seconds
```

Seems fine.

Now:

```text
1000 concurrent requests
```

Your LLM becomes the bottleneck.

### Why LLMs Are Always The Bottleneck

| Component      | Typical latency |
|----------------|-----------------|
| Database       | ~5ms            |
| Redis          | ~1ms            |
| Vector search  | ~10ms           |
| **LLM**        | **500ms – 5000ms** |

LLM dominates latency. This is true in almost every AI system.

### Production Solution — Async Processing

Instead of:

```text
User waits
```

Do:

```text
Transaction Created
       ↓
Queue
       ↓
Worker
       ↓
Tagging
       ↓
Result Stored
```

Architecture:

```text
API
 ↓
Kafka / SQS / RabbitMQ
 ↓
Tagging Workers
 ↓
Postgres
```

Now API returns instantly.

---

## Problem #2 — Rate Limits

Imagine OpenAI gives:

```text
500 RPM
```

(requests per minute)

You suddenly receive:

```text
5000 requests/min
```

Now:

```text
429 Too Many Requests
```

Everywhere.

### Solution: Queue + Backpressure

```text
Transactions
 ↓
Queue
 ↓
Workers
 ↓
OpenAI
```

Workers process at controlled speed.

Example:

```text
Queue Size = 10000
Worker Count = 20
Each Worker = 20 RPM
```

Total:

```text
400 RPM
```

Safe.

---

## Problem #3 — Cost Explosion

Today:

```text
100 transactions
```

Cost:

```text
$0.10
```

Nobody cares.

Now:

```text
1 million transactions/day
```

Maybe:

```text
$1000/day
```

or more. Now the CFO cares.

### Cost Optimization Strategy

Most transactions are repetitive.

Example:

```text
AWS
AWS
AWS
AWS
AWS
```

Why call LLM every time?

Use **vendor rule** first.

Architecture:

```text
Vendor Rule
   ↓
Found?
   ↓
AUTO_TAG

Otherwise
   ↓
RAG
   ↓
LLM
```

You may reduce **~80%** of LLM calls. (This is why rule-first routing is in the capstone hero path.)

---

## Problem #4 — Database Scaling

Current:

```sql
SELECT *
FROM transactions
WHERE tenant_id = ?
```

Works fine.

Now:

```text
100 million transactions
```

Problem.

### Solution — Partition

Example:

```text
transactions_2026_01
transactions_2026_02
transactions_2026_03
```

Or:

```text
partition by tenant
```

Large SaaS systems do this.

---

## Problem #5 — Vector Search Scaling

Today:

```text
100 vectors
```

Tomorrow:

```text
50 million vectors
```

pgvector starts struggling.

### Migration Path

| Stage | Stack |
|-------|--------|
| **Stage 1** | Postgres + pgvector — perfect for capstone |
| **Stage 2** | Qdrant or Weaviate |
| **Stage 3** | Dedicated retrieval cluster |

You don't need Stages 2–3 now. But interviewers may ask.

---

## Problem #6 — Multi-Tenant Isolation

Suppose:

```text
Company A:  AWS → Cloud Infrastructure
Company B:  AWS → Platform Costs
```

Different chart of accounts.

If retrieval leaks:

```text
Tenant A data → Tenant B
```

Disaster.

### Production Rule

Every query:

```sql
WHERE tenant_id = ?
```

No exceptions.

- Every embedding: **tenant scoped**
- Every vendor rule: **tenant scoped**

This is a common interview topic. The capstone enforces this in schema and orchestrator design.

---

## Problem #7 — Observability

Imagine finance complains:

```text
Wrong classification
```

How do you debug?

Without traces:

```text
Impossible
```

With traces:

```text
run_id
 ↓
retrieval
 ↓
prompt
 ↓
response
 ↓
decision
```

You already designed this in the capstone ([§12 production AI layer](./superpowers/specs/2026-05-28-tagging-mini-product-design.md#12-production-ai-engineering-layer)). This is why step-level tracing matters.

---

## Problem #8 — Reliability

OpenAI outage. Now what?

| Option | Behavior |
|--------|----------|
| **A — Queue** | Mark pending until service returns |
| **B — Fallback model** | GPT-4o → fail → Claude |
| **C — Review queue** | LLM unavailable → `QUEUE_REVIEW` |

Financial systems often choose **Option C** — never silent wrong GL.

The capstone thin escalation pattern (§12.4) is a preview of Option B at single-transaction scale.

---

## Problem #9 — Evaluation Drift

Today:

```text
95% precision
```

Three months later:

```text
82% precision
```

Why? Maybe:

- new vendors
- changed prompts
- changed model

Without evals:

```text
You don't know.
```

Production AI systems continuously run **regression evals** before deployment. This is why `pnpm eval:tagging` and `eval_set_version` / `prompt_version` in audit are first-class in the build spec.

---

## How To Answer In An Interview

If someone asks:

> How would you scale this project to 10,000 tenants?

You can say:

1. Keep API **stateless**
2. Move transaction processing to **async workers**
3. Add **queue-based backpressure** for LLM rate limits
4. Use **vendor-rule cache** (rule-first) to reduce LLM calls
5. Keep all retrieval **tenant scoped**
6. **Partition** transaction data
7. Track **latency, cost, and confidence** per run
8. Continuously evaluate model quality through **regression evals**

That answer demonstrates much more maturity than talking about LangChain, LangGraph, or agent frameworks.

---

## What This Capstone Opens The Door To

Your project naturally leads to discussing:

- Distributed systems
- Queue architectures
- Multi-tenant SaaS
- AI infrastructure
- Cost optimization
- AI observability
- Evals and eval drift
- Reliability engineering

These are exactly the topics that separate an **AI engineer** from someone who only knows how to call an LLM API.

---

## Defer (post-demo / document only)

Do **not** build before Jun 10. Mention in interview + `docs/architecture.md` as migration path.

| Topic | Why defer | What to say in interview |
|-------|-----------|---------------------------|
| **Async queue** (Kafka, SQS, RabbitMQ) | Sync orchestrator sufficient at capstone volume | “API enqueues; workers drain — we added `processing_status` now so migration is additive” |
| **Worker fleet / horizontal scale** | No load yet | “Stateless API + queue + N identical tagging workers” |
| **DB partitioning** | &lt;100k rows in POC | “Partition `transactions` by month or tenant when table size warrants” |
| **Dedicated vector DB** | pgvector recall@5 meets target on eval | “Move to Qdrant if recall@5 drops below 80% at scale” |
| **Hybrid BM25 + reranker** | Defer per tech-stack unless eval fails | “Add only when dense retrieval underperforms on held-out set” |
| **Langfuse / Jaeger / full OTel** | Step spans in `audit_log` cover debug story | “Structured audit today; export to OTel when ops team needs dashboards” |
| **Cost alerting / budgets** | Log cost per run; no enforcement needed | “Aggregate `cost_usd` by tenant for billing phase 2” |
| **Multi-provider router** | Thin §12.4 escalation is enough | “Fallback chain behind same LLM client interface” |
| **Vendor rule TTL / admin revoke UI** | Rules persist until override in v1 | “`effective_at` / `revoked_at` columns in production schema” |
| **Real ERP, pre-auth block, payment execution** | Capstone scope | See [README § Production next](../README.md#production-next-document-only) |

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [What we are building](./what-we-are-building.html) | Business problem + beginner flow |
| [Hero build spec §12](./superpowers/specs/2026-05-28-tagging-mini-product-design.md#12-production-ai-engineering-layer) | Production AI layer in Phase 1 build |
| [Hero build spec §12.9](./superpowers/specs/2026-05-28-tagging-mini-product-design.md#129-scale-ready-hooks-implement-now-not-later) | Scale-ready hooks shipped |
| [README § Production next](../README.md#production-next) | Phase 2+ deferrals |
| [tech-stack.md](./tech-stack.md) | Locked stack + pgvector deferral rationale |
