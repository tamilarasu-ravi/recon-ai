# Tagging “Mini Product” Design (Option 1: Minimal UI + Strong CLI)

**Date:** 2026-05-28  
**Project:** `capstone-project` (AI-Native CFO Operations Platform)  
**Goal:** Turn the capstone from a “POC demo” into an interview-ready **mini product** that is safe-by-default, auditable, and measurable via evals.

---

## 1) Outcomes (definition of “complete package”)

By code freeze (**Jun 10, 2026**), a reviewer can:

- Run the system locally with Docker + a seed script.
- See an end-to-end flow (policy → receipt gate → tagging → review → override → memory update → rerun).
- Run `pnpm eval:tagging` and get a scorecard + a machine-readable results artifact (including calibration bins and cost totals).
- Inspect “why” for each decision (rules hit, retrieval neighbors, confidence decomposition, policy gate).
- Replay any decision by `run_id` with per-step traces (latency, tokens, cost, prompt/model versions) — see §12.

Non-negotiable property: **silent miscoding is worse than refusal**. If the system is unsure or outputs are invalid, it must **not** auto-post a wrong GL.

---

## 2) Target audience & demo modes

This build is optimized for a combination of:

- **ML/AI engineer interviews**: eval harness, retrieval, structured outputs, safety gates, deterministic confidence.
- **Full-stack/product engineer interviews**: workflow state machine, review queue UX, data model, DX scripts.

Demo modes:

- **3–5 min scripted demo** (`pnpm demo` + minimal UI)
- **Deep-dive** (open a transaction detail page to show audit/retrieval/confidence and replay)

---

## 3) System boundaries (the story)

### 3.1 Orchestrator owns workflow state

The orchestrator is deterministic TypeScript application code and is the **only** component that:

- advances the transaction state machine
- writes `events`, `audit_log`, `review_queue`
- persists learning (vendor rules) after a human override

Agents:

- **return structured payloads only**
- do not call each other
- do not directly mutate workflow state

### 3.2 Linear pipeline (capstone-appropriate)

For a card transaction:

```text
TransactionCreated → PolicyEvaluated → (receipt gate) → TransactionTagged → mock ERP sync
```

For invoices:

```text
InvoiceReceived → AP recommendation (recommend-only, no execution)
```

---

## 4) What ships (features)

### 4.1 Minimal UI (must feel real)

Routes/pages:

- **`/review-queue`**
  - list of queued items with filters
  - reason chips: `new_vendor`, `low_confidence`, `receipt_required`, `coa_mismatch`, `llm_parse_failed`
  - each item links to a transaction detail view

- **`/transactions/[id]`**
  - transaction inputs (vendor, amount, memo, mcc, tenant)
  - policy status (including receipt gate state)
  - tagging result (suggestion, confidence, tri-state decision)
  - “why” panel:
    - vendor rule hit/miss
    - retrieval top-k neighbors (with similarities)
    - confidence breakdown and gating checks
  - override form:
    - choose correct `gl_account_id` (required)
    - optional tax + dimensions (if in scope for v1)
    - submit override → immediate vendor rule persistence + audit entry

### 4.2 CLI (the reliability and proof surface)

Commands:

- **`pnpm demo`**
  - runs a scripted sequence that produces:
    - a receipt-gated transaction (tagging blocked until receipt cleared)
    - at least one `QUEUE_REVIEW` transaction
    - at least one `REFUSE` (unknown vendor / CoA mismatch / injection)
    - one override that becomes a vendor rule, then a replay that improves outcome

- **`pnpm eval:tagging`**
  - replays `eval/tagging_eval.jsonl` and prints:
    - auto-tag precision @ threshold
    - review rate, refusal rate
    - retrieval recall@k (diagnostic)
    - override→rule replay success rate (on scripted cases)
    - confidence calibration bins (§12.5)
    - total token count and `cost_usd` for the run (§12.2)
  - writes results to `eval/results/tagging-latest.json`

Determinism mode:

- **`LLM_ENABLE_LIVE_CALLS=false`** runs evals using fixtures (no network calls) so results are repeatable.

### 4.3 Evals (grading + interview credibility)

Eval set:

- file: `eval/tagging_eval.jsonl`
- size: **30** cases (minimum), including:
  - easy known vendors
  - 5 long-tail/weird vendors
  - at least one CoA mismatch case
  - at least one **prompt injection** memo case

Minimum eval guarantees:

- A “red team” case must never yield an out-of-CoA GL and must not silently auto-tag.
- Any Zod parse failure must never result in `AUTO_TAG`.

### 4.4 Memory (tenant-scoped, auditable)

Memory is not chat history; it is structured, replayable data:

- **Vendor memory:** `vendor_rules` (learned via override; rule-first routing)
- **Label memory:** embeddings + labeled transaction corpus (pgvector retrieval)
- **Audit memory:** `events` + `audit_log` with `run_id` correlation

Optional (deferred unless needed for explainability):

- “Knowledge graph” representation implemented as relational edge tables (e.g., vendor alias edges, allowed GL edges).

---

## 5) Tagging pipeline design (hero workflow)

### 5.1 Inputs

Per transaction (tenant-scoped):

- `tenant_id`
- raw vendor string + memo/description
- amount/currency
- merchant category (MCC) if available
- policy evaluation outcome + receipt cleared state
- CoA allow-list snapshot

### 5.2 Steps (rule-first, then retrieval, then one LLM call)

1. **Vendor normalization**
   - resolve raw vendor → canonical `vendor_id` (via aliases per tenant)

2. **Vendor rule lookup (memory)**
   - if `vendor_rules` match exists, treat as highest-signal input into confidence/gating

3. **Retrieve similar labeled transactions**
   - pgvector top-k neighbors (k=5 default), tenant-scoped
   - neighbors include their historical `gl_account_id` labels and similarity scores

4. **Structured LLM suggestion (single call)**
   - provide: CoA allow-list + top-k neighbors + vendor rule (if any)
   - output: strict JSON validated by Zod

5. **Deterministic confidence scorer**
   - uses:
     - vendor rule strength
     - max similarity in top-k
     - label agreement among neighbors
     - CoA validity (hard gate)

6. **Tri-state decision gate**
   - see §6

### 5.3 Structured output contract (tagging agent)

Tagging agent returns:

- `suggested_gl_account_id`
- optional `tax_code`, `dimensions`
- `rationale` (human readable, but must not claim facts not in inputs)
- `raw_model_output` (for audit debugging)
- `parse_status`: `ok | failed`

Orchestrator derives final `decision` and persists to DB.

---

## 6) Safety & autonomy bars (must be enforced)

### 6.1 Tri-state outcome

- **`AUTO_TAG`**
  - confidence ≥ `TAG_AUTO_THRESHOLD` (default 0.92)
  - and (**vendor rule hit** OR ≥3 similar labeled transactions)
  - and policy allows (receipt cleared when required)
  - and suggested GL is **in tenant CoA allow-list**

- **`QUEUE_REVIEW`**
  - confidence ≥ `TAG_REVIEW_THRESHOLD` (default 0.75)
  - or vendor is new/unseen
  - or model output parse failed
  - or policy requires receipt not yet cleared (item should be visible as blocked)

- **`REFUSE`**
  - confidence < 0.75
  - or unknown vendor with no meaningful retrieval neighbors
  - or suggested GL ∉ CoA allow-list

### 6.2 Failure-mode handling rules (hard)

- **Zod parse failure**: never `AUTO_TAG`; enqueue review with reason `llm_parse_failed`.
- **Out-of-CoA GL**: never `AUTO_TAG`; `REFUSE` (or `QUEUE_REVIEW` if you want human correction; default to strict refusal).
- **Receipt gate active**: never `AUTO_TAG`; must show clearly in UI/CLI why tagging is blocked.

---

## 7) Data model (minimum subset to ship)

Tenant-scoped core tables (names illustrative):

- `tenants`
- `chart_of_accounts`
- `vendors` + `vendor_aliases`
- `vendor_rules`
- `transactions` — include `processing_status` (§12.9) and ingest idempotency key
- `vendor_rules` — unique on `(tenant_id, vendor_id)`
- `transaction_embeddings` (pgvector)
- `policies` + `policy_rules` + `policy_versions`
- `review_queue`
- `events` (append-only)
- `audit_log` (structured observability payload per step)
- `receipts` (mock upload + `cleared_at`)
- `invoices` + `ap_recommendations` (stub)

Every event and audit record includes:

- `run_id`, `tenant_id`, `transaction_id` (or `invoice_id`), `agent`, `latency_ms`, `confidence`, `decision`, `policy_version`

Production AI fields (§12) are stored on `audit_log` and/or nested `steps[]` within the observability payload.

---

## 8) Eval harness design (what it measures)

### 8.1 Metrics

Minimum:

- auto-tag **precision** @ `TAG_AUTO_THRESHOLD`
- review rate, refusal rate
- retrieval recall@k (k=5)
- override→rule replay success rate (scripted cases)
- confidence calibration bins (§12.5)
- aggregate `cost_usd` and token counts per eval run (§12.2)
- `llm_calls_saved_by_rules` — count of tagging runs that skipped LLM via rule-first path (§12.9)

### 8.2 Outputs

- stdout scorecard (human readable)
- `eval/results/tagging-latest.json` (machine readable)
- `docs/eval-results.md` summary (baseline + failure notes)

---

## 9) Docs & packaging (GitHub/LinkedIn ready)

Required docs:

- `docs/demo-script.md`: 3–5 min rehearsal path with expected outputs
- `docs/architecture.md`: orchestrator vs agents, data flow, safety gates
- `docs/eval-results.md`: baseline metrics + short failure postmortems

README updates:

- remove placeholders (`Your Name`, email)
- include “Quickstart” (Docker + seed + demo + eval)

---

## 10) Non-goals (explicitly out of scope)

- Real ERP OAuth (QuickBooks/Xero), real posting
- Real-time pre-authorization block
- Payment execution / dual control
- Fine-tuning/training pipelines
- Full receipt OCR (mock upload only)
- Multi-agent orchestration frameworks for the linear pipeline

---

## 11) Risks & mitigations

- **Eval flakiness with live LLM** → fixtures mode for eval; keep live mode for interactive demo.
- **Scope creep into UI polish** → minimal UI only; correctness + evals first.
- **“Looks like a toy”** → seed realistic synthetic data; make “why” and audit visible.
- **Observability scope creep** → step traces in `audit_log` first; full OpenTelemetry/Langfuse only if Phase B done early (§12.6).

---

## 12) Production AI engineering layer

This section closes the gap between “strong capstone POC” and “credible AI systems portfolio piece.” It adds **observability, cost accounting, version governance, optional model escalation, and confidence calibration** — without new agents or workflow complexity.

**Principle:** upgrade `audit_log` + LLM client + eval harness. Do not build a separate ops platform.

### 12.1 Step-level tracing (primary observability)

Every orchestrator run produces a **replayable trace** keyed by `run_id`. Traces are persisted in `audit_log.observability` (JSON column or equivalent).

**Minimum step sequence (tagging path):**

```text
vendor_normalize → rule_lookup → retrieval → llm_tagging → confidence_gate → tri_state_decision
```

**Step span schema:**

```typescript
interface StepSpan {
  step: string;              // e.g. "retrieval", "llm_tagging"
  latency_ms: number;
  success: boolean;
  error?: string;            // if success === false
  metadata?: Record<string, unknown>;  // step-specific fields (see below)
}
```

**Step-specific metadata (examples):**

| Step | Metadata fields |
|------|-----------------|
| `vendor_normalize` | `raw_vendor`, `vendor_id`, `alias_matched` |
| `rule_lookup` | `rule_hit`, `vendor_rule_id`, `gl_account_id` |
| `retrieval` | `top_k`, `max_similarity`, `neighbor_ids[]`, `label_agreement` |
| `llm_tagging` | `model_id`, `prompt_version`, `prompt_hash`, `parse_status`, token fields (§12.2) |
| `confidence_gate` | `confidence`, `components` (breakdown), `thresholds_used` |
| `tri_state_decision` | `decision`, `gates_passed[]`, `gates_failed[]` |

**Full run payload (illustrative):**

```json
{
  "run_id": "run_01HYZ8K3M2",
  "transaction_id": "txn_abc123",
  "tenant_id": "tenant_a",
  "agent": "tagging",
  "policy_version": "pol_v3",
  "prompt_version": "tagging-v1.0",
  "eval_set_version": null,
  "model_id": "gpt-4o-mini",
  "latency_ms": 892,
  "confidence": 0.94,
  "decision": "AUTO_TAG",
  "steps": [
    { "step": "vendor_normalize", "latency_ms": 12, "success": true, "metadata": { "vendor_id": "vnd_aws" } },
    { "step": "rule_lookup", "latency_ms": 4, "success": true, "metadata": { "rule_hit": true } },
    { "step": "retrieval", "latency_ms": 38, "success": true, "metadata": { "top_k": 5, "max_similarity": 0.91 } },
    { "step": "llm_tagging", "latency_ms": 820, "success": true, "metadata": { "model_id": "gpt-4o-mini", "prompt_tokens": 412, "completion_tokens": 89, "cost_usd": 0.00038 } },
    { "step": "confidence_gate", "latency_ms": 2, "success": true, "metadata": { "confidence": 0.94 } },
    { "step": "tri_state_decision", "latency_ms": 1, "success": true, "metadata": { "decision": "AUTO_TAG" } }
  ]
}
```

**UI/CLI replay:** transaction detail page and `pnpm demo` output must surface `run_id` and allow inspection of `steps[]` (collapsed by default; expandable “trace” panel).

**Interview answer:** “I debug bad decisions by replaying `run_id` — I see policy version, retrieval neighbors, model I/O, confidence decomposition, and per-step latency/cost.”

**Stretch (optional, Jun 8+ only if Phase B green):**

- Export spans as OpenTelemetry-compatible JSON to stdout or a file
- Langfuse integration (already listed as optional in README) — thin wrapper around existing LLM client, not a second logging path

### 12.2 LLM cost accounting

Every LLM call through `src/lib/llm/client.ts` records token usage and estimated cost.

**Fields persisted on the `llm_tagging` step (and any other LLM step):**

| Field | Type | Notes |
|-------|------|-------|
| `model_id` | string | e.g. `gpt-4o-mini` |
| `prompt_tokens` | number | from provider response |
| `completion_tokens` | number | from provider response |
| `total_tokens` | number | sum |
| `cost_usd` | number | computed locally from price table |

**Price table:** static map in `src/lib/llm/pricing.ts` (input/output $ per 1M tokens per model). Update when models change; document source in code comment.

**Aggregates:**

- Per-transaction: sum cost across all LLM steps in one `run_id`
- Per-eval-run: `pnpm eval:tagging` prints and writes `total_cost_usd`, `total_tokens` to `eval/results/tagging-latest.json`

**Env vars (optional overrides):**

```bash
LLM_MODEL=gpt-4o-mini              # default tagging model
LLM_MODEL_ESCALATION=gpt-4o        # escalation target (§12.4)
```

### 12.3 Prompt, model, and eval version governance

Version metadata is logged on every agent run so performance changes are attributable.

**Prompt versioning:**

- Prompts live in `src/lib/llm/prompts/` (not inline in handlers)
- Each prompt file exports a version constant, e.g. `export const TAGGING_PROMPT_VERSION = "tagging-v1.0"`
- Log on every LLM call: `prompt_version`, `prompt_hash` (SHA-256 of prompt file contents)

**Model versioning:**

- Log `model_id` on every LLM step (already in §12.2)

**Eval set versioning:**

- Compute `eval_set_version` as SHA-256 prefix (first 8 chars) of `eval/tagging_eval.jsonl` contents
- Include in eval results JSON and in audit when running eval harness (`agent: "eval"`)

**Threshold/config versioning:**

- Log active thresholds (`TAG_AUTO_THRESHOLD`, `TAG_REVIEW_THRESHOLD`) on confidence_gate step metadata
- Optional: `config_hash` of relevant env vars for full reproducibility

**Interview answer:** “If precision drops, I diff `prompt_hash`, `eval_set_version`, and threshold config — not just ‘the model got worse.’”

### 12.4 Model routing (thin escalation, hard-capped)

Demonstrate production-style model escalation without a router service.

**Default flow:**

```text
gpt-4o-mini (default)
  ↓
Zod parse fail OR post-score confidence < TAG_REVIEW_THRESHOLD
  ↓
gpt-4o (escalation model, max 1 retry)
  ↓
still fail OR still below gates
  ↓
QUEUE_REVIEW (never AUTO_TAG on escalation path alone)
```

**Rules (non-negotiable):**

- `MAX_LLM_RETRIES = 1` (aligns with capstone agent loop safety)
- Escalation **never bypasses** CoA allow-list, receipt gate, or tri-state gates
- Escalation alone does **not** qualify for `AUTO_TAG` unless all normal gates pass (rule hit or ≥3 neighbors + confidence ≥ threshold)
- Log `routing_reason` on `llm_tagging` step: `initial` | `parse_failed` | `low_confidence`
- Log both attempts as separate sub-spans or sequential `llm_tagging` steps with `attempt: 1 | 2`

**When `LLM_ENABLE_LIVE_CALLS=false`:** escalation is skipped; fixtures replay uses canned responses.

**Cut order if behind:** defer escalation to Jun 8+; keep cost + prompt versioning from day 1.

### 12.5 Confidence calibration (eval harness extension)

Answer “why is 0.92 meaningful?” with evidence, not assertion.

**Calibration output:** after `pnpm eval:tagging`, print and write a reliability table:

| Confidence bin | Count | Precision (GL correct when decision ∈ {AUTO_TAG, QUEUE_REVIEW}) |
|----------------|-------|------------------------------------------------------------------|
| 0.90 – 1.00    | n     | x%                                                               |
| 0.75 – 0.90    | n     | x%                                                               |
| 0.50 – 0.75    | n     | x%                                                               |
| &lt; 0.50       | n     | x% (mostly REFUSE)                                               |

**Threshold justification paragraph** (auto-generated or templated in `docs/eval-results.md`):

> At `TAG_AUTO_THRESHOLD=0.92`, held-out auto-tag precision is ≥ 95%. Bins below 0.90 show materially lower precision; threshold was chosen to maximize auto precision, not recall.

**Implementation notes:**

- Bins are computed from eval run outputs, not a separate dataset
- REFUSE cases with no GL suggestion are excluded from precision numerator but counted in bin totals
- No calibration dashboard UI — markdown table + JSON in eval results is sufficient

**Optional stretch:** simple ASCII chart in CLI output for demo flair.

### 12.6 Rollout timeline and cut order

| Priority | Feature | When | Cut if behind |
|----------|---------|------|---------------|
| **P0** | Step spans in `audit_log` | May 28–29 (scaffold) | Never |
| **P0** | `tenant_id` on all tables + indexes; tenant-scoped queries only | May 28–29 | Never |
| **P0** | Rule-first pipeline (skip LLM when vendor rule + gates pass) | Jun 1–2 | Never |
| **P0** | Token + cost on LLM client | May 31 (LLM client) | Never |
| **P0** | `prompt_version` + `prompt_hash` | May 31 | Never |
| **P0** | `processing_status` + ingest idempotency on transactions | May 28–29 | Never |
| **P0** | LLM outage / provider error → `QUEUE_REVIEW` (not silent fail) | May 31 | Never |
| **P1** | `llm_skipped_reason` in audit when rule-first bypasses LLM | Jun 2 | Never |
| **P1** | 429 retry with exponential backoff in LLM client | May 31 | Jun 6 |
| **P1** | Calibration bins in eval output | Jun 3 (eval harness) | Never |
| **P1** | `eval_set_version` + `llm_calls_saved_by_rules` in eval JSON | Jun 3 | Never |
| **P2** | Model escalation (1 retry) | Jun 6+ (if E2E green) | Jun 8 |
| **P2** | Trace panel in UI / CLI (`run_id`, steps, cost) | Jun 7 | Jun 9 (CLI-only OK) |
| **P3** | OpenTelemetry JSON export | Jun 8+ | Always cut for 3-week tier |
| **P3** | Langfuse integration | Jun 8+ | Always cut for 3-week tier |

**If slipping past Jun 6:** keep P0 + P1; cut P2–P3. Never cut step traces or eval calibration.

### 12.7 Interview Q&A hooks (prepared answers)

| Question | Answer in this project |
|----------|------------------------|
| Why orchestrator instead of LangGraph? | Linear pipeline with explicit gates; orchestrator is deterministic TS, fully unit-testable; framework cost &gt; benefit at this complexity |
| Why pgvector over Qdrant? | &lt;100 txns/tenant; one Postgres DB; tenant-scoped queries; hybrid BM25 deferred only if recall@5 &lt; 80% on eval |
| Why precision, not recall? | Finance domain: wrong auto-post is catastrophic; we optimize precision @ `AUTO_TAG`; recall reported but not gate |
| How was 0.92 chosen? | Calibration bins from held-out eval; see `docs/eval-results.md` and `eval/results/tagging-latest.json` |
| What prevents prompt injection? | Red-team eval case; CoA allow-list hard gate; Zod validation; never `AUTO_TAG` on parse failure |
| Invalid JSON from LLM? | Retry once on escalation model (optional) → `QUEUE_REVIEW` with reason `llm_parse_failed` |
| How do vendor rules expire? | v1: rules persist until admin override or soft-delete; document `effective_at` / `revoked_at` columns as production next |
| How do you debug a bad classification? | Replay `run_id` → step trace with retrieval neighbors, model I/O, confidence breakdown, cost |
| 10,000 tenants? | `tenant_id` on every row/query; stateless API; `processing_status` for future async workers; see [production-at-scale.md § implement now](../production-at-scale.md#implement-now-vs-defer-capstone-build) |

### 12.8 Non-goals (this layer)

- Full distributed tracing infrastructure (Jaeger, Tempo, etc.)
- Real-time cost alerting or budget enforcement
- Dynamic model router with A/B testing
- Separate prompt registry / feature flag service
- Calibration dashboard UI
- Message queues (Kafka / SQS / RabbitMQ), worker pools, DB partitioning, dedicated vector DB cluster

These are valid **production next** talking points in [`docs/production-at-scale.md`](../production-at-scale.md) and `docs/architecture.md`, not capstone build targets.

### 12.9 Scale-ready hooks (implement now, not later)

Cheap design choices that address [`production-at-scale.md`](../production-at-scale.md) themes **without** building distributed infrastructure. Add at scaffold — retrofitting is painful.

#### Schema (May 28–29)

| Field / constraint | Table | Purpose |
|--------------------|-------|---------|
| `tenant_id` NOT NULL + index | All tenant-owned tables | Multi-tenant isolation (Problem #6) |
| `processing_status` enum | `transactions` | `pending` \| `processing` \| `completed` \| `failed` — async-ready without a queue (Problem #1 prep) |
| `idempotency_key` unique per `(tenant_id, …)` | ingest / `transactions` | Safe retries on duplicate ingest (Problem #8) |
| UNIQUE `(tenant_id, vendor_id)` | `vendor_rules` | One rule per vendor per tenant |

Suggested transaction status flow (sync API today; same states a worker would use tomorrow):

```text
ingested → policy_evaluated → tagging_pending → tagged | queued | refused
```

#### Pipeline (Jun 1–2)

| Hook | Behavior | Maps to |
|------|----------|---------|
| **Rule-first skip** | If vendor rule hit + CoA valid + gates pass → compute confidence from rule; **skip LLM** | Cost optimization (Problem #3) |
| **`llm_skipped_reason`** | Audit metadata e.g. `vendor_rule_hit` when LLM not called | Demo + eval cost story |
| **Tenant-scoped retrieval** | pgvector query always `WHERE tenant_id = ?` | Isolation (Problem #6) |

#### LLM client (May 31)

| Hook | Behavior | Maps to |
|------|----------|---------|
| **429 backoff** | Exponential backoff on rate limit; max retries per capstone rules | Rate limits (Problem #2 prep) |
| **Provider outage** | Catch errors → `QUEUE_REVIEW` + audit reason `llm_unavailable` | Reliability Option C (Problem #8) |
| **Cost + tokens** | Already §12.2 — required on every call that runs | Problem #3 |

#### Eval harness (Jun 3)

| Metric | Purpose |
|--------|---------|
| `llm_calls_saved_by_rules` | Count runs where rule-first skipped LLM — quantifies ~80% cost reduction narrative |
| `total_cost_usd`, calibration bins | Already §12.2 / §12.5 |

#### UI / CLI (Jun 7 — P2)

- Show `llm_skipped_reason` on transaction detail when LLM was bypassed
- Expandable trace panel: `run_id`, `steps[]`, per-step cost
- Review queue reasons include `llm_unavailable`, `rate_limited` (if surfaced)

#### Explicitly defer (document in architecture, do not build)

See [production-at-scale.md § Defer](../production-at-scale.md#defer-post-demo--document-only).

