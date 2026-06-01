# Showcase deck — June 14 (5 slides + backup)

**Time:** 3–5 minutes live demo · **Backup:** 2-min screen recording if API fails  
**Deep links:** [architecture.md](./architecture.md) · [eval-results.md](./eval-results.md) · [demo-script.md](./demo-script.md)

---

## Slide 1 — Problem & thesis (30s)

**Title:** ReconAI — confidence-gated CFO operations (not a chatbot)

**Bullets:**

- Mid-market finance teams lose time on **close tagging**, **policy exceptions**, and **duplicate payables**
- Silent wrong GL codes are worse than asking a human
- **Thesis:** One event-driven platform; orchestrator owns state; agents return structured decisions only

**Say:** “I built a platform spine with depth on auto-tagging and thin policy/AP gates—not three separate AI apps.”

---

## Slide 2 — Architecture (45s)

**Title:** Orchestrator + hero tagging + gated stubs

```text
Card txn → Policy → Tagging (rule-first · RAG · 1× LLM) → Review queue / AUTO_TAG
Invoice → AP (recommend-only, duplicate refused)
```

**Bullets:**

- **Postgres + pgvector**, tenant-scoped everything
- **Tri-state:** `AUTO_TAG` | `QUEUE_REVIEW` | `REFUSE`
- **Audit:** `run_id`, step traces, `policy_version`, cost fields
- **Learning loop:** accountant override → `vendor_rules` → similar txn auto-tags

**Diagram:** Use §1 overview from [architecture.md](./architecture.md) (export as image if needed).

---

## Slide 3 — Eval results (45s)

**Title:** Golden set — 30 cases, measured before demo day

| Metric | Result | Target |
|--------|--------|--------|
| Pass rate | **100%** (30/30) | ≥ 70% |
| Auto-tag precision | **100%** | ≥ 95% |
| Red-team (case-08) | `QUEUE_REVIEW` | Never wrong GL auto-post |

**Bullets:**

- Harness: `pnpm eval:tagging` on `eval/tagging_eval.jsonl`
- Policy skipped in eval (tagging + gates only); policy proven in E2E demo
- Threshold **0.92** auto — conservative by design

**Say:** “Evals are directional at n=30, but auto-tag precision is the metric we refuse to miss.”

---

## Slide 4 — Live demo path (60–90s)

**Title:** What you’ll see

| Step | Story |
|------|--------|
| 1 | Slack $55 → **AUTO_TAG** (rule-first) |
| 2 | AWS $99 → **receipt gate** → review until receipt |
| 3 | Receipt + reprocess → **AUTO_TAG** |
| 4–6 | New vendor → **override** → replay **learns** |
| 7–8 | AP **recommend-only** + **duplicate refused** |
| 9 | **REFUSE** unknown vendor (tenant-b) |

**Commands:** `pnpm demo` or UI at `/review-queue` after `pnpm dev`

**Say:** “No payment execution—AP only recommends and refuses duplicates.”

---

## Slide 5 — Safety & what we did not build (30s)

**Title:** “Don’t know” is a feature

**Bullets:**

- **REFUSE** on explicit unknown vendors (`unknown_vendor_pattern`)
- **Prompt-injection guard** on memo (red-team eval case)
- GL **6300** review-only — no silent T&E auto-post
- **Out of scope:** ERP OAuth, live payments, fine-tuning, production pre-auth

**Say:** “The system is allowed to refuse; that’s operational safety, not a bug.”

---

## Backup slide — REFUSE (if live demo skips)

**Title:** When we refuse to guess

- Ingest: `Unknown Courier 42` → decision **`REFUSE`**, reason **`unknown_vendor_pattern`**
- Show `/review-queue` (tenant-b) or eval case-06
- Contrast: wrong AUTO_TAG vs honest REFUSE

---

## Q&A prep (one-liners)

| Question | Answer |
|----------|--------|
| Why not LangGraph? | Orchestrator is explicit TS state machine—easier to audit and test |
| Why pgvector? | Tenant-scoped label memory; rule-first skips LLM when possible |
| Hallucinated GL? | CoA allow-list + tri-state; injection → review, never blind auto-post |
| Multi-tenant? | `tenant_id` on every row; demo uses tenant-a / tenant-b |
| Production next? | Idempotency, DLQ, Langfuse, MCP—see architecture § implement vs defer |

---

## Dry-run checklist

See [dry-run-checklist.md](./dry-run-checklist.md).
