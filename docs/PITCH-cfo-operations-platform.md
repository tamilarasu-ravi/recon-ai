# CFO Operations Platform: Event-Driven AI Decisioning with Multi-Agent Orchestration

Turn every card transaction and invoice into confidence-gated GL coding, policy enforcement, and pay recommendations — with a full audit trail and explicit refusal when the system does not know.

## The Problem

Month-end financial operations are slow, serial, and lossy:

| Step | Activity | Typical Time Lost |
|------|----------|-------------------|
| 1 | Finance codes ~250 txns/month to GL, tax, and dimensions | ~1 week/month at close |
| 2 | Ops chases receipts and adjudicates out-of-policy spend | 3–5 days/month manual queue |
| 3 | Treasury decides pay timing across Card, Pay, Optimize | 2–4 days in spreadsheets |
| 4 | Context re-entered between policy, tagging, and AP tools | 1–2 days lost per close |
| 5 | Finally trustworthy books | **12–20 days** of finance time per month |

Every handoff is a queue, a context switch, and an opportunity to lose nuance. By the time books are closed, decisions live in Slack threads and spreadsheets — not in a structured, replayable format. **Silent miscoding** (wrong GL posted with high confidence) is worse than slowing down for human review.

## The Solution

A coordinated **orchestrator + three-agent** workflow that runs financial decisioning on shared tenant data:

A central orchestrator ingests each transaction, runs **policy evaluation** first, then **tagging** (only if gates pass), and routes invoices to **AP recommend-only** — persisting every step to an append-only audit log with `policy_version` at transaction time.

At each stage, specialized agents return structured payloads; only the orchestrator writes state

The **tagging agent** fans out to vendor rules, pgvector retrieval, then one LLM call — and routes to AUTO_TAG, QUEUE_REVIEW, or REFUSE

The **policy agent** applies hybrid compiled rules plus NL-derived rules — flagging receipt or review before auto-tag is allowed

The **AP agent** runs deterministic cash math first; the LLM narrates rationale only after numbers are fixed

One human checkpoint per uncertain transaction (review queue); accountant override becomes a **per-tenant vendor rule** for the next similar spend

**Total runtime:** ~2–5 seconds per transaction (tagging path)  
**Human time:** ~30 seconds per queued item (override or accept)  
**Output:** Structured events, audit records, and eval-verified autonomy decisions — ready for demo and production extension

## What You Get

**Event Platform** — multi-tenant chart of accounts, review queue, `policy_version` on every `PolicyEvaluated` event

**Tagging Agent (hero)** — vendor normalize → retrieval + rules → confidence-gated GL, tax, and dimensions

**Policy Agent** — post-authorization evaluate; ALLOW, FLAG_RECEIPT, or FLAG_REVIEW; receipt gate blocks AUTO_TAG until cleared

**Design Doc + Schedule** — architecture, tech stack, and day-by-day plan through showcase **June 14, 2026** (code freeze **June 10**)

**Eval Harness** — 30 held-out transactions, five long-tail vendors, one red-team injection case, precision @ auto threshold

**Artifact History** — every event, confidence score, override, and “would pay” recommendation persisted and queryable

The output is structured work, not a chat transcript.

## Example

**Input:**

Card spend: vendor **AWS**, amount **$240**, tenant **TenantA**, memo *Amazon Web Services — production account*. Policy requires receipts over $200.

**Output:**

A **PolicyEvaluated** event: ALLOW after receipt uploaded (mock)

A **TransactionTagged** result: GL **Cloud Infrastructure (6105)**, confidence **0.95**, decision **AUTO_TAG**, rationale citing vendor rule and four similar labeled transactions

An audit log line with `run_id`, `latency_ms`, and `policy_version` for replay

A follow-on **AP recommendation** for the same vendor: pay date, funding source (Optimize vs Card), and audit entry **“would pay”** — no payment executed

**Contrast input:** unknown vendor **Zephyr Labs LLC**, no retrieval neighbors → **REFUSE** with audit reason (no guessed GL)

All ready to demonstrate on showcase day or hand to engineers extending ERP sync and pre-authorization.

## Why This Matters

**For Finance Operators**

Get from raw card feed to coded transactions with explicit review boundaries, not silent errors

Multi-signal confidence (rules + retrieval + CoA validity) catches cases a single model guess would miss

One override teaches the system a vendor rule — no retraining cycle

**For Engineers**

Receive a clear orchestrator vs agent boundary — agents do not call each other or mutate workflow state

Structured Zod outputs and deterministic policy/AP math — LLM only where judgment is required

Can extend with MCP tools and ERP adapters without rewriting the core state machine

**For Leadership**

Faster month-end iteration with replayable audit trail on every autonomy decision

Reusable pattern for policy review, close tagging, and payables — one platform, three workflows

Proof via eval table and live demo, not hand-waving

## Summary

| | Traditional Close + Expenses | CFO Operations Platform |
|---|------------------------------|-------------------------|
| Time to trustworthy coding | Days to weeks per close | Seconds per txn + targeted human review |
| Review depth | Manual skim | Rules + retrieval + tri-state autonomy |
| Human meetings | Many handoffs | Review queue + one override path |
| Output format | Chat, spreadsheets, siloed tools | Structured events + audit log |
| Auditability | Scattered | Full replayability (`run_id`, `policy_version`) |
| Learning loop | Retrain or start over | Override → per-tenant vendor rule |
| Proof | Anecdotes | Eval harness + **demo June 14, 2026** |

---

*Capstone · AI Engineering · Code freeze June 10, 2026 · Showcase June 14, 2026*  
*Repo: `capstone-project` · Regenerate PDF: `.venv-pdf/bin/python scripts/generate-pitch-pdf.py`*
