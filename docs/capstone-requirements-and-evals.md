# Capstone Requirements — Problem, Data Processing & Evaluation Criteria

This document covers the three rubric pillars that define **what** we are solving, **how data is handled safely**, and **how we measure success**. Architecture and implementation tradeoffs live in the separate system design document.

---

## 1) Problem definition

Mid-market finance teams spend days each month on month-end close because every transaction must be coded to the correct **tenant-specific chart of accounts** (GL account, tax, dimensions) and reconciled. In parallel, they manually enforce spend policies (receipt requirements, caps, vendor/category bans) and later decide invoice payment timing and funding across products. This work is slow, repetitive, and error-prone — and **silent miscoding is worse than refusal**.

> **Naming note:** This capstone focuses on **financial operations** (spend tagging, policy, AP recommend-only), not full CFO treasury/budgeting. “ReconAI Financial Operations Platform” is the accurate scope label.

### What we are building (capstone scope)

One **event-driven financial operations platform** that orchestrates three workflows on shared tenant/vendor data:

- **Workflow 1 (hero):** transaction auto-tagging with **confidence-gated autonomy** (`AUTO_TAG` / `QUEUE_REVIEW` / `REFUSE`)
- **Workflow 2 (thin):** policy evaluation + receipt gate that can block auto-tag
- **Workflow 3 (stub):** AP recommend-only (duplicate detection + simple forecast + “would pay” audit)

### What we are not building

- Real ERP OAuth + auto-posting (QuickBooks/Xero), real-time pre-auth blocking, clawback, payment execution/dual control
- Fine-tuning, full OCR pipeline
- Multi-currency optimization math (document-only)

### Business impact

| Pain                                     | Why it matters                                             |
| ---------------------------------------- | ---------------------------------------------------------- |
| Manual GL coding at month-end            | Delays close; scales poorly with transaction volume        |
| Silent miscoding                         | Harder to detect than explicit refusal; audit and tax risk |
| Policy enforcement in spreadsheets       | Inconsistent; no audit trail at transaction time           |
| AP timing decisions without cash context | Missed discounts or funding mistakes                       |

### Success criteria (product-level)

- Demonstrate **tri-state autonomy** with measurable precision at `AUTO_TAG`
- Show **human-in-the-loop** review queue and override → vendor rule learning
- Prove **“don’t know” behavior** (refusal/review) on edge cases, not silent guessing
- Integrate policy as a **bounded gating stage** (receipt/caps can block `AUTO_TAG`)
- Demonstrate **AP recommend-only** with deterministic cash forecast and “would pay” audit trail (no payment execution)

---

## 2) Data processing

### Data sources

Capstone uses **synthetic** and **mock** inputs to avoid real financial/PII exposure:

- **Synthetic transactions** for two tenants (seeded into Postgres)
- **Mock invoices** (JSON/CSV fixtures)
- **Mock receipts** (checkbox / pasted text; no OCR pipeline in capstone)

### PII handling

Because inputs are synthetic, the project avoids real PII by construction. Still, the system is designed as if it could receive sensitive data:

- **No secrets in code**; `.env.local` is never committed
- **Audit logging is structured and bounded**: store identifiers + truncated/sanitized text; never store raw card numbers or tokens
- **Tenant isolation** is enforced at the query layer (every row and query is scoped by `tenant_id`)

### Input validation (before processing)

| Field                | Rule                                                       |
| -------------------- | ---------------------------------------------------------- |
| `vendor_raw`, `memo` | Length-bounded; sanitized before LLM use and logging       |
| `amount`, `currency` | Validated types; no free-form strings in numeric fields    |
| Secrets / tokens     | Rejected at ingest; never passed to LLM or stored in audit |

### Guardrails (safety constraints)

Guardrails are implemented as **deterministic gates** in the orchestrator — not “best-effort” model behavior:

- **CoA allow-list gate:** model proposals must map to a GL in the tenant’s CoA; otherwise downgrade to `QUEUE_REVIEW` or `REFUSE`
- **Structured output validation:** LLM outputs are parsed and validated with **Zod**
- **Autonomy routing:** orchestrator invariants block `AUTO_TAG` when any of the following hold: receipt required and not cleared, LLM output invalid, or GL outside CoA.
- **Red-team prompt injection case:** eval includes a memo attempting to override instructions; expected behavior is refusal/review, never out-of-CoA tagging

### Data flow (high level)

```text
Synthetic/mock ingest
  → tenant-scoped validation + sanitization
  → orchestrator (deterministic gates)
  → agents (structured payloads only)
  → append-only events + audit_log
```

---

## 3) Evaluation criteria

### 3.1 Eval set

- **File:** `eval/tagging_eval.jsonl`
- **Size:** 30 held-out cases (minimum), including:
  - easy known vendors
  - 5 long-tail/weird vendors
  - unknown vendor refusal
  - CoA mismatch case
  - red-team injection memo

**Small‑n caveat (explicit):** At \(n=30\), confidence intervals are wide. A “95% precision” target can swing with 1–2 mistakes, so we calibrate thresholds conservatively and treat the eval set as a minimum viable signal, not a statistically robust claim.

### 3.2 Metrics and gates

Reported by `pnpm eval:tagging`:

| Metric                        | Type          | Target / gate                         | Purpose                                      |
| ----------------------------- | ------------- | ------------------------------------- | -------------------------------------------- |
| **Auto-tag precision @ 0.92** | Primary       | ≥ **95%** on held-out eval            | Main correctness signal                      |
| **Review rate**               | Calibration   | Documented (no hard fail)             | Confidence calibration / UX                  |
| **Refusal rate**              | Safety        | Documented (no hard fail)             | “Don’t know” behavior                        |
| **Retrieval recall@5**        | Asserted gate | ≥ **80%**                             | Retrieval regressions fail CI                |
| **Override → rule replay**    | Learning      | Scripted cases pass                   | Vendor rule learning works                   |
| **Cost**                      | Operational   | avg < **$0.001**/decision (dev scale) | `total_cost_usd`, `llm_calls_saved_by_rules` |
| **Latency**                   | Operational   | p95 < **5s** (local tagging path)     | Step traces in `audit_log`                   |

> **Cold-start boundary (intentional — not a bug):** When `hasMinHistory=false`, even a perfect retrieval match may not reach `AUTO_TAG`. New tenants must build tenant-specific history (or explicit vendor rules) before auto-posting. Document observed behavior in `docs/eval-results.md`.

Retrieval recall is a first-class metric because it affects safety and UX:

- If recall@k drops, more transactions fall back to `QUEUE_REVIEW` (safe but lower automation).
- The harness **asserts** minimum recall@5 ≥ 80% so retrieval regressions are surfaced early.

**Error handling (eval-relevant):** failures must route safely — LLM outage → `QUEUE_REVIEW` (never `AUTO_TAG`); invalid LLM output → `QUEUE_REVIEW`/`REFUSE`; CoA mismatch or red-team injection → never out-of-CoA `AUTO_TAG`. Details: §3.3.

**Threshold calibration:** run harness at 0.85 / 0.90 / 0.92 / 0.95; report unsafe auto-tags vs auto-tag rate; explain conservative choice given small‑n. Details: §3.4.

### 3.3 Error handling expectations (detail)

| Condition                        | Expected routing          | Must never            |
| -------------------------------- | ------------------------- | --------------------- |
| LLM outage or 429s after retries | `QUEUE_REVIEW`            | `AUTO_TAG`            |
| Zod parse/validation failure     | `QUEUE_REVIEW` / `REFUSE` | out-of-CoA `AUTO_TAG` |
| GL outside tenant CoA            | `REFUSE` or review        | `AUTO_TAG`            |
| Red-team injection memo          | `REFUSE` / `QUEUE_REVIEW` | out-of-CoA `AUTO_TAG` |

### 3.4 Threshold calibration (detail)

Thresholds are environment-configurable (`TAG_AUTO_THRESHOLD`, `TAG_REVIEW_THRESHOLD`; defaults 0.92 / 0.75).

**Calibration note:**

- Run the harness at multiple thresholds (e.g., 0.85 / 0.90 / 0.92 / 0.95).
- Report the tradeoff: unsafe auto-tags vs auto-tag rate.
- Explain why the chosen threshold is conservative given small‑n uncertainty.

### 3.5 Deliverable outputs

| Artifact                           | Contents                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `docs/eval-results.md`             | Metrics table + 2–3 failure postmortems + threshold calibration note      |
| `eval/results/tagging-latest.json` | Machine-readable eval artifact from latest harness run                    |
| `pnpm eval:tagging`                | Runnable harness — runs locally and in CI; **required green before demo** |

---
