# Product roadmap

Phased delivery from **platform core** (shipped) to **enterprise**. Status keys: **Done** · **In progress** · **Planned** · **Deferred**.

---

## Phase 0 — Platform core (Done)

Foundation that all workflows share.

| Item | Status | Notes |
|------|--------|-------|
| Postgres + pgvector schema, migrations | Done | `src/lib/db/` |
| LangGraph tagging workflow + checkpointer | Done | `tagging-graph.ts` |
| LangGraph AP workflow (recommend-only) | Done | `ap-graph.ts` |
| Tri-state gates + policy cap | Done | `gates.ts`, `policy-cap.ts` |
| Events + `audit_log` + review queue sync | Done | |
| Ingest / reprocess / override / HITL APIs | Done | `src/app/api/` |
| MCP server | Done | `pnpm mcp` — v0.2 tools for AP, policy, ERP |
| Tagging eval harness | Done | `pnpm eval:tagging` |
| Rule-first LLM client + retries | Done | `src/lib/llm/` |

**Exit criteria:** `pnpm test`, `pnpm eval:tagging`, `pnpm demo` green.

---

## Phase 1 — Operator product (Done)

What accountants and demos touch daily.

| Item | Status | Notes |
|------|--------|-------|
| Review queue + pagination + cache | Done | |
| Transaction detail (why, override, receipt, reprocess) | Done | |
| RAG neighbor panel on transaction detail | Done | top‑k from audit `retrieval` step |
| Full-screen loading UX | Done | stable timing + overlay |
| Home hub (product, not capstone-only) | Done | |
| Policy admin UI (rules, NL policies) | Done | `/policy` |
| AP inbox UI (invoices, recommendations) | Done | `/ap` |
| Settings (API keys + ERP status) | Done | `/settings` |
| Dashboard metrics (AUTO_TAG rate, queue depth) | Done | Home + `GET /api/metrics` |
| Playwright smoke E2E | Done | `pnpm test:e2e` — ingest → queue → override |
| Showcase prep + checklist | Done | `pnpm showcase:prep`, `docs/capstone/showcase-checklist.md` |

**Exit criteria:** Primary flows usable without CLI; no capstone-only copy in UI.

---

## Phase 2 — Integrations (In progress)

| Item | Status | Notes |
|------|--------|-------|
| Mock ERP adapter (posted GL event) | Done | `src/lib/integrations/erp/`, `ErpTransactionPosted` event |
| API keys (tenant-scoped Bearer) | Done | `api_keys` table, `REQUIRE_API_AUTH` |
| QuickBooks / Xero OAuth read + write | Planned | design in `architecture.md` |
| Webhook ingest + HMAC signing | Done | `POST /api/webhooks/transactions`, async 202 default |
| Bulk import (CSV) | Done | `POST /api/ingest/transactions/bulk`, Settings UI |
| Async processing (queue workers) | Done | `processing_status` + `after()` background tagging |

**Exit criteria:** One real ERP sandbox sync for AUTO_TAG post; idempotent webhook ingest.

---

## Phase 3 — Policy & AP depth (In progress)

| Item | Status | Notes |
|------|--------|-------|
| NL policy compiler (hybrid rules) | Done | `POST /api/policies/compile`, `/policy` UI |
| Employee notification loop (receipt chase) | Planned | mock → email/Slack |
| AP cash forecast fixtures | Planned | |
| Funding source compare (narrative) | Deferred | no payment execution |
| Pre-auth card block (design + stub) | Deferred | |

**Exit criteria:** 3+ NL policies per tenant in UI; AP path visible in product nav.

---

## Phase 4 — Enterprise (Planned)

| Item | Status | Notes |
|------|--------|-------|
| Auth (SSO / API keys per tenant) | Planned | |
| Row-level security in Postgres | Planned | |
| LLM cost accounting (audit + UI + eval totals) | Done | Hoisted `cost_usd` / tokens; home + txn detail |
| Langfuse / OTel production dashboards | Partial | optional — traces get cost when keys set |
| CI eval gate on PR | Planned | |
| Vercel + Neon production deploy | Optional | `docs/vercel-deploy.md` |
| Hybrid retrieval (BM25 + vector) | Deferred | pgvector sufficient until recall gap |

See also: [`production-at-scale.md`](./production-at-scale.md) for interview-level scaling narrative.

---

## Explicitly out of product scope (until redesigned)

- Live payment rails execution without dual control
- Model fine-tuning on customer data
- Full receipt OCR pipeline (upload text/mock OK)
- Clawback automation

---

## How to pick the next sprint

1. Read [STRATEGY.md](../STRATEGY.md) — confirm track (usually Phase 1 or 2).
2. Pick **one** row from that phase marked Planned.
3. Add API + UI + test + eval case if tagging behavior changes.
4. Update this table’s Status column in the same PR.
