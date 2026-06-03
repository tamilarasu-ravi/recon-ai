# ReconAI — Product Strategy

## Problem

Mid-market finance teams spend disproportionate time on **card close**, **policy compliance**, and **payables timing** on the same vendor and money-movement data. Point solutions (a tagging bot, a policy chatbot, an AP spreadsheet) fragment audit trails and autonomy rules.

## Product thesis

**One event-driven financial operations platform** with a deterministic orchestrator, specialized agents, and consistent autonomy bars:

```text
Spend / invoice event
  → Policy evaluation (gates)
  → Transaction tagging (hero — GL, tax, dimensions)
  → ERP sync (integration layer)
  → AP recommendation / execution (gated, later)
```

Agents return **structured decisions**; only the orchestrator mutates workflow state, review queues, and audit logs.

## Users

| Persona | Primary jobs |
|---------|----------------|
| **Staff accountant** | Review queue, override GL, clear receipts, approve AUTO_TAG |
| **Controller / CFO** | Policy outcomes, autonomy rates, cost per run, eval drift |
| **Integrator / agent** | Ingest txns, reprocess, MCP tools — same contract as UI |

## What ships today (v0.1 platform core)

| Capability | Status |
|------------|--------|
| LangGraph orchestrator (tagging + AP graphs) | **Production-shaped** |
| Tri-state tagging + vendor rule learning | **Production-shaped** |
| Policy rules + receipt gate | **Thin but real** |
| Review queue UI + transaction detail + HITL | **Production-shaped** |
| Audit log + events + `run_id` replay | **Production-shaped** |
| MCP platform tools | **Beta** |
| Eval harness (`pnpm eval:tagging`) | **Production-shaped** |
| AP recommend-only + duplicate detection | **Stub** — graph + API, limited UI |
| Auth / RBAC / SSO | **Not started** |
| Real ERP OAuth + post | **Not started** |
| Payment execution | **Out of product scope** (recommend-only until dual-control design) |

## Tracks of work

**Production build order:** [`docs/production-roadmap.md`](./docs/production-roadmap.md) (P1–P5).  
Feature inventory: [`docs/product-roadmap.md`](./docs/product-roadmap.md).

1. **P1 Deploy & CI** — Done.
2. **P2 Security** — Done — [`docs/security.md`](./docs/security.md).
3. **P3 Async ops** — Done — 202 ingest, poll status, bulk CSV, retries/dead-letter, cron worker.
4. **P4 Integrations** — In progress — async webhooks, NL policy compiler; OAuth/AP depth next.
5. **P5 Enterprise** — In progress — Playwright E2E + eval gate in CI; SSO, RLS next.

## Non-negotiables (all phases)

- **Fail safe**: prefer `QUEUE_REVIEW` / `REFUSE` over guessing.
- **Tenant isolation**: every query scoped by `tenant_id`.
- **Auditability**: append-only events; `policy_version` at transaction time.
- **Cost control**: rule-first tagging; one LLM call max per uncertain txn.
- **Agent-native**: MCP + API parity — anything in UI is a tool.

## Success metrics

| Metric | Target direction |
|--------|------------------|
| AUTO_TAG precision @ threshold | ≥ 95% on held-out eval set |
| LLM calls saved (rule hit) | ↑ over time as rules learned |
| Review queue time-to-clear | ↓ with overrides → rules |
| p95 ingest → decision (sync path) | < 5s demo; < 30s prod target |
| Eval regression | 0 unintended decision flips per release |

## Capstone origin

This codebase began as an AI Engineering capstone (June 2026). Capstone timeline, submission checklist, and showcase artifacts live under [`docs/capstone/`](./docs/capstone/README.md). **Product direction is governed by this file and the roadmap**, not the academic deadline.
