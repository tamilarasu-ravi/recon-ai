# System Design — ReconAI Financial Operations Platform

> **Product context:** [STRATEGY.md](../STRATEGY.md) · [product-roadmap.md](./product-roadmap.md)

---

## 1) System design

### Logical architecture (overview)

Single platform spine: the **orchestrator** owns workflow state; **agents** return structured payloads only; **Postgres + pgvector** is the system of record; the **LLM** is invoked at most once per uncertain tagging decision.

```text
                         ┌──────────────────────────────────────┐
                         │   Orchestrator (deterministic TS)     │
                         │   state · events · audit · review Q   │
                         └──────────────────┬───────────────────┘
            ┌──────────────────────────────┼──────────────────────────────┐
            ▼                              ▼                              ▼
   Tagging agent (hero)          Policy evaluator (thin)          AP stub (recommend-only)
   rule-first · RAG · LLM        caps · receipt gate · NL rules   duplicate · forecast
            │                              │                              │
            └──────────────────────────────┴──────────────────────────────┘
                                           ▼
                         Postgres + pgvector (tenant-scoped)
                         events · audit_log · vendor_rules · embeddings
                                           ▼
                         OpenAI / Anthropic (structured LLM call)
```

Detailed deployment stack: **§1.13**. Event/state flow: **§1.2**.

### 1.1 Architectural principle: orchestrator owns workflow state

The **orchestrator** is deterministic TypeScript application code and is the only component that:

- advances workflow state
- writes `events`, `audit_log`, `review_queue`
- persists learning (vendor rules) after a human override

Agents:

- return **structured payloads**
- do not call each other
- do not directly mutate workflow state

#### Interface contracts (inputs/outputs and invariants)

This section makes the design **implementable** and reviewable. It defines the minimum payload contracts and the invariants the orchestrator enforces.

**Core identifiers (present everywhere)**

- `tenant_id`: required and authoritative; used to scope every query
- `run_id`: unique per end-to-end pipeline invocation; used for replay/debug
- `idempotency_key`: required for ingest endpoints to ensure “exactly-once” processing semantics at the platform level

**Event payload contracts (minimal)**

**`TransactionCreated`**

- Required: `tenant_id`, `external_transaction_id`, `transaction_timestamp`, `amount`, `currency`, `vendor_raw`
- Optional: `memo`, `mcc`
- Invariant: input must not contain secrets; `vendor_raw` and `memo` are length-bounded and sanitized before LLM use/logging

**`PolicyEvaluated`**

- Required: `tenant_id`, `transaction_id`, `policy_version`, `outcome` (`ALLOW` / `FLAG_RECEIPT` / `FLAG_REVIEW`)
- Invariant: `policy_version` is captured at evaluation time and never retroactively mutated for that transaction

**`TransactionTagged`**

- Required: `tenant_id`, `transaction_id`, `decision` (`AUTO_TAG` / `QUEUE_REVIEW` / `REFUSE`), `confidence`
- If `decision=AUTO_TAG`: must include `gl_account_id` and must pass CoA allow-list validation
- Invariant: `gl_account_id` ∈ tenant CoA; otherwise downgrade to review/refuse

**`InvoiceReceived`** (stub)

- Required: `tenant_id`, `external_invoice_id`, `vendor_raw`, `amount`, `currency`, `invoice_date`

**Orchestrator invariants (non-negotiable)**

- **No `AUTO_TAG`** if: receipt required and not cleared, LLM output invalid, or GL outside CoA
- **Fail safe** on dependency failures: prefer `QUEUE_REVIEW` / `REFUSE` over guessing
- **Audit/event integrity**: append-only writes; retention/archiving strategy is documented in **§1.12 Security considerations**

### 1.2 Event-driven workflow

Events are append-only and tenant-scoped. Canonical payload contracts are in **§1.1**.

**End-to-end flow:**

```text
TransactionCreated
  → PolicyEvaluated
  → (receipt gate may block)
  → TransactionTagged (AUTO_TAG | QUEUE_REVIEW | REFUSE)
  → mock ERP sync event (documented; real ERP out of scope)

InvoiceReceived
  → AP recommendation (recommend-only; no execution)
```

### 1.3 Tagging (hero) design

**Goal:** Suggest GL/tax/dimensions safely; measure precision at `AUTO_TAG` threshold; learn from accountant overrides.

Pipeline (single-pass retrieval, no agentic loops):

1. **Vendor normalization** → canonical `vendor_id`
2. **Rule-first lookup** (`vendor_rules`) → if hit and gates pass, skip LLM
3. **pgvector retrieval**: top‑k similar labeled transactions **scoped by `tenant_id`**
4. **One structured LLM call**: propose `gl_account_id`, `tax_code`, `dimensions`, `rationale`
5. **Deterministic confidence scoring** from rule/retrieval signals
6. **Tri-state decision**:
   - `AUTO_TAG` if confidence ≥ `TAG_AUTO_THRESHOLD` (default 0.92) and strong support (rule hit or ≥3 similar labels)
   - `QUEUE_REVIEW` if 0.75–0.92 or new vendor
   - `REFUSE` if < 0.75, unknown vendor, CoA mismatch, or invalid output

**Learning loop:** accountant override → persist per-tenant vendor rule (`vendor_rules`). No fine-tuning in capstone.

**Rule staleness / correction safety (acknowledged):**

- Vendor rules are not correct-by-construction; they can become stale (vendor changes billing) or be created from a mistaken override.
- Capstone v0 keeps rules simple, but production evolution should add metadata (`created_at`, `last_confirmed_at`, `created_by_run_id`) and allow either TTL/decay or periodic re-confirmation (e.g., downgrade to `QUEUE_REVIEW` after N days without confirmation).

#### Confidence score (concrete formula)

The confidence score is a deterministic scalar \(c \in [0, 1]\) computed **after** validation (Zod + CoA allow-list) and used only for routing.

Definitions:

- `ruleHit`: boolean (vendor rule match)
- `top1Sim`: cosine similarity of the top-1 pgvector neighbor (0..1), or 0 if none
- `agreeFrac`: fraction of top‑k neighbors whose GL matches the proposed GL (0..1), or 0 if none
- `supportCount`: number of neighbors in top‑k that match proposed GL (integer)
- `hasMinHistory`: boolean (tenant has ≥10 labeled txns)

Formula:

```text
retrievalWeight = hasMinHistory ? 0.85 : 0.60
supportBoost    = (supportCount >= 3) ? 0.10 : 0.0

base = retrievalWeight * (0.70 * top1Sim + 0.30 * agreeFrac) + supportBoost

confidence = ruleHit ? 1.0 : clamp01(base)
```

Notes:

- If `ruleHit` is true, confidence is capped at **1.0** (but policy gates may still block `AUTO_TAG`).
- If retrieval fails or returns 0 neighbors, `top1Sim=0` and `agreeFrac=0`, so the system naturally routes to `QUEUE_REVIEW`/`REFUSE` unless a rule exists.
- Thresholds are calibrated on the eval set; see [evaluation criteria](./capstone-requirements-and-evals.md#3-evaluation-criteria) and `docs/eval-results.md`.
- **Conservative boundary (intentional):** when `hasMinHistory=false`, even a “perfect” retrieval match may still not reach `AUTO_TAG`. This is deliberate cold-start safety.

**Cold start (new tenant, no labels):**

- If pgvector retrieval returns **0 neighbors** (empty tenant history), we fall back to a small **Global Vendor Prior** mapping (e.g., “Uber → Travel”) that is **not derived from other tenants’ private data**.
- **Safety rule:** global priors can inform the suggestion/context, but the outcome routes to `QUEUE_REVIEW` unless a tenant-specific rule/history exists.
- **Provenance:** manually curated allow-list of ~50 globally recognizable vendors in static config; never learned from tenant data; updated only via explicit developer review.

### 1.4 Policy design (thin slice)

Policy representation is **hybrid**:

- 2–3 compiled structured rules (caps, banned MCC/category, receipt required)
- 1 NL policy compiled to JSON (admin/offline), then evaluated deterministically per txn

**NL → JSON compilation (explicitly manual in capstone):**

- Triggered by an admin/developer (one-off) action, not an automated pipeline.
- Uses a single structured LLM call to produce JSON that is validated (Zod) and reviewed before being saved as a new `policy_version`.
- If compilation is ambiguous or fails validation, the policy is not updated; the prior `policy_version` remains active.

Policy outcomes:

- `ALLOW`
- `FLAG_RECEIPT`
- `FLAG_REVIEW`

Receipt gating: `FLAG_RECEIPT` blocks `AUTO_TAG` until cleared.

### 1.5 AP design (recommend-only stub)

AP is designed to show deterministic boundaries:

- Ingest mock invoices
- Duplicate detection hash(`vendor` + `amount` + `date`)
- Deterministic cash snapshot + simple 7/30-day buckets
- Output recommendation: pay date + funding source
- **Never execute payment**; write “would pay” to audit

### 1.6 Storage and multi-tenancy

**System of record:** Postgres + pgvector (single DB).

Key tables (conceptual):

- `tenants`, `chart_of_accounts`
- `vendors`, `vendor_rules`, `vendor_aliases`
- `transactions`, `transaction_embeddings`
- `policies`, `policy_rules` (versioned)
- `events` (append-only), `audit_log` (structured), `review_queue`
- `receipts`, `invoices`, `ap_recommendations`

**Tenant isolation:** every row is scoped by `tenant_id`; retrieval queries must include `WHERE tenant_id = ?`.

### 1.7 Observability

Each run emits a `run_id` and step-level traces (latency + cost) into `audit_log`:

- `run_id`, `tenant_id`, `transaction_id`/`invoice_id`, `agent`, `decision`, `confidence`, `policy_version`
- step spans: normalize → rule lookup → retrieval → LLM → confidence gate → tri-state decision
- tokens + `cost_usd` per LLM call (and totals in eval runs)

This enables “replay any decision by `run_id`” in the CLI/UI.

### 1.8 Non-functional requirements (POC SLOs)

These targets make the autonomy story measurable. Full metric definitions: [evaluation criteria](./capstone-requirements-and-evals.md#32-metrics-and-gates).

| Dimension                  | Target                                                 | How measured                       |
| -------------------------- | ------------------------------------------------------ | ---------------------------------- |
| **Correctness (AUTO_TAG)** | ≥ **95% precision** on held-out eval at threshold 0.92 | `pnpm eval:tagging`                |
| **Latency (tagging path)** | p95 < **5s** per transaction (local)                   | `audit_log` step traces            |
| **Availability**           | “degraded but safe” behavior under upstream failures   | failure-mode tests + demo          |
| **Cost**                   | average < **$0.001** per tagging decision (dev scale)  | `cost_usd` in traces + eval totals |
| **Safety**                 | 0 silent out-of-CoA `AUTO_TAG`                         | CoA gate + red-team case           |

### 1.9 Scalability considerations

Designed for **capstone scale** (hundreds to thousands of txns/day); documents path to **10,000 tenants / 1M txns/day** without rewriting the core spine.

**Current (capstone scale):**

- Next.js API routes + deterministic orchestrator
- Postgres + pgvector (single DB) with `tenant_id` indexes
- synchronous pipeline (fast enough for demo), with `processing_status` for future async

**Postgres/pgvector optimization before swapping vector DB:**

- When embeddings per tenant grow beyond ~10,000 rows, add a `pgvector` **HNSW** index on the embedding column (still tenant-scoped at query time).
- Only after exhausting in-Postgres optimizations introduce a dedicated vector store (Qdrant/Weaviate).

**Future (post-demo):**

- Queue-based ingestion + workers (SQS/Kafka/RabbitMQ) for bursty month-end
- Backpressure + DLQ for LLM outages/rate limits
- DB partitioning by time/tenant; optional row-level security
- Dedicated vector store only when pgvector becomes the bottleneck

For a longer-form scaling narrative, see [`production-at-scale.md`](./production-at-scale.md).

### 1.10 Rate limits and backpressure

**Capstone behavior (implement now):**

- Central LLM client with exponential backoff on 429 (bounded retries)
- If retries exhausted: route to `QUEUE_REVIEW` (safe degradation)
- Record a structured audit event: `llm_unavailable` and step trace details

**Production evolution (defer):**

- enqueue tagging jobs; workers drain respecting provider QPS
- per-tenant budgets and global concurrency limits
- DLQ for repeated failures; replay tooling via `run_id`

### 1.11 Failure scenarios

| Failure                                | Expected outcome                                  | Why it’s safe                      |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| **LLM outage / repeated 429**          | `QUEUE_REVIEW` (never `AUTO_TAG`)                 | avoids silent miscoding            |
| **Invalid / non-parseable LLM output** | `QUEUE_REVIEW` or `REFUSE` (depending on context) | Zod gate prevents unsafe posting   |
| **pgvector retrieval failure**         | skip retrieval; reduce confidence; `QUEUE_REVIEW` | fails “conservatively”             |
| **DB write failure (events/audit)**    | fail request (no partial state); surface error    | preserves audit integrity          |
| **Policy evaluation error**            | fail closed: `FLAG_REVIEW` (no auto-tag)          | policy gate should not be bypassed |
| **CoA mismatch**                       | `REFUSE` (audit reason)                           | explicit “don’t know”              |

### 1.12 Security considerations

**Prompt injection (memo field):**

- mitigations: structured outputs (Zod), CoA allow-list, tri-state gate, red-team eval case

**Multi-tenant data leakage:**

- `tenant_id` on every row and query; retrieval queries must be tenant-scoped; vendor rules unique per tenant

**Audit integrity:**

- append-only `events`; avoid overwriting prior decisions
- idempotency keys to prevent duplicate processing on retries/replays
  - **Derivation:** `idempotency_key = sha256(tenant_id + external_transaction_id + transaction_timestamp)` at the API boundary; unique constraint on `(tenant_id, idempotency_key)`.
  - **Race behavior:** simultaneous duplicates → one insert wins; other returns existing result (idempotent success).
- **Retention:** partition `events` by time; archive old partitions to immutable storage before pruning; replay tooling respects archive location.

**Secrets management:**

- `.env.local` never committed; production deploy uses secret store (Vercel env vars)

### 1.13 Deployment view

```text
Browser (review UI)
   ↓
Next.js (API routes + UI)
   ↓
Orchestrator (deterministic)
   ├─ Policy evaluator (TS)
   ├─ Retrieval (pgvector)
   ├─ LLM client (OpenAI/Anthropic)
   └─ Confidence + tri-state gate
   ↓
Postgres + pgvector (events, audit, rules, embeddings)
```

**Deployment note (serverless cold starts):** If deployed as serverless functions, the first request after idle can consume a meaningful fraction of the p95 latency budget. For the capstone, local demo avoids this; production would use a long-lived process or provisioned concurrency.

### 1.14 Cost optimization strategy

```text
Vendor rule hit (known vendor)
  ↓
Skip LLM entirely (AUTO_TAG with deterministic rule)

No rule hit
  ↓
Retrieve top-k similar labeled txns (pgvector)
  ↓
Call LLM once (structured suggestion)
  ↓
Confidence gate → AUTO_TAG / QUEUE_REVIEW / REFUSE
```

Cost levers tracked in evals and traces:

- **Rule-first skips**: `llm_calls_saved_by_rules` + `llm_skipped_reason`
- **Per-call cost**: `prompt_tokens`, `completion_tokens`, `cost_usd`
- **Per-run totals**: `total_cost_usd` from `pnpm eval:tagging`

---

## 2) Key tradeoffs (and why)

### Orchestrator vs multi-agent framework (LangGraph)

- **Chosen:** deterministic orchestrator + small agent modules
- **Why:** linear pipeline + explicit gates; fewer moving parts; easier to test and reason about

### pgvector vs external vector DB (Qdrant/Pinecone)

- **Chosen:** pgvector in Postgres
- **Why:** small data volume; one database; simpler ops; strong enough retrieval for capstone scale

### Vendor rules vs fine-tuning

- **Chosen:** override → deterministic vendor rules
- **Why:** fast, explainable, tenant-scoped, auditable, and improves immediately after one correction

### RAG vs agents

- **Chosen:** single-pass retrieval (rule-first + pgvector top‑k) + one structured LLM call
- **Why:** predictable cost/latency; easier eval harness; avoids multi-step agent trajectory failures

---

## Appendix A) Decision log

| Decision                                                    | Why it was chosen                                       | Where documented                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Orchestrator owns state                                     | deterministic, testable, auditable; agents stay pure    | §1.1                                                                              |
| Tri-state autonomy (`AUTO_TAG` / `QUEUE_REVIEW` / `REFUSE`) | explicit “don’t know” behavior; avoids silent miscoding | §1.3 + §1.11                                                                      |
| Rule-first before LLM                                       | reduce cost; deterministic memory for known vendors     | §1.3 + §1.14                                                                      |
| pgvector in Postgres                                        | simplest ops at capstone scale; tenant-scoped retrieval | §1.6 + §2                                                                         |
| HNSW before switching vector DB                             | optimize Postgres first; delay infra complexity         | §1.9                                                                              |
| Structured outputs + Zod                                    | prevent hallucinated schema; safe failure routing       | [requirements §2](./capstone-requirements-and-evals.md#2-data-processing) + §1.11 |
| Idempotency keys                                            | prevent duplicate processing; required for finance      | §1.12                                                                             |
| Manual NL→JSON policy compile                               | honest scope; avoid unreliable automation               | §1.4                                                                              |
| Retrieval recall@5 asserted                                 | prevent silent UX regression; make retrieval measurable | [requirements §3](./capstone-requirements-and-evals.md#32-metrics-and-gates)      |
| Conservative cold-start posture                             | avoid early auto-posting before tenant-specific history | §1.3                                                                              |

---

## 3) Future evolution (post-capstone roadmap)

Documented roadmap — not additional capstone scope before demo.

| Version       | Add                                                 | Why                                   |
| ------------- | --------------------------------------------------- | ------------------------------------- |
| v0 (capstone) | tagging hero + policy gate + AP stub + evals        | prove safe autonomy and learning loop |
| v1            | real ERP sync adapter (QuickBooks/Xero)             | close the loop to accounting          |
| v2            | async ingestion + worker pools                      | handle month-end bursts reliably      |
| v3            | stronger policy actions (employee loop, escalation) | reduce out-of-policy leakage          |
| v4            | AP optimization math (discounts/FX/yield)           | value beyond recommend-only           |
| v5            | continuous evals + drift monitoring                 | keep autonomy safe over time          |

---
