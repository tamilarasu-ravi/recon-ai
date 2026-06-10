# Production roadmap — ReconAI

**Goal:** Deployable, multi-tenant financial ops platform — not a demo script.  
**Source of truth for build order:** this file → [`STRATEGY.md`](../STRATEGY.md) → [`docs/architecture.md`](./architecture.md).

Capstone/showcase docs under `docs/capstone/` are **historical**; do not block production work.

---

## Current baseline (already shipped)

| Area | Status |
|------|--------|
| LangGraph orchestrator + audit + events | Production-shaped |
| Tri-state tagging + vendor rules + pgvector RAG | Production-shaped |
| Policy evaluator + receipt gate | Thin but real |
| Review UI, AP inbox, policy admin, settings | Usable |
| API keys + optional `REQUIRE_API_AUTH` | Implemented |
| Webhook HMAC ingest | Implemented |
| Mock ERP post | Implemented |
| MCP platform tools | Beta |
| Eval harness `pnpm eval:tagging` | Production-shaped |
| Vercel + Neon guide | Documented |

---

## Production phases (build order)

### Phase P1 — Deploy & CI gate (Done)

**Outcome:** Every merge is verified; deploy smoke is one command.

| Item | Status |
|------|--------|
| GitHub Actions: typecheck, unit tests, build | Done | `.github/workflows/ci.yml` |
| CI Postgres + pgvector: migrate + deterministic eval | Done | |
| `/api/health` (liveness) + `/api/ready` (DB + extensions) | Done | |
| `pnpm production:check` — env validation for prod | Done | |
| Document prod env matrix in `.env.example` | Done | |

**Exit:** Green CI on `main`; Vercel preview deploy + `curl /api/ready`.

---

### Phase P2 — Security & tenancy hardening (Done)

**Outcome:** Safe to expose on the public internet.

| Item | Status | Notes |
|------|--------|--------|
| `REQUIRE_API_AUTH=true` in production | Done | `authorizeApiRequest` + `/api/ready` |
| Tenant scope on every API route | Done | 403 on cross-tenant key |
| Scoped `GET /api/tenants` | Done | Single tenant when auth on |
| Rate limiting | Done | Ingest, webhook, tenant API — see `docs/security.md` |
| Security headers | Done | `next.config.ts` |
| Secrets in client bundle | Done | Removed `NEXT_PUBLIC_ERP_*`; `/api/settings/public` |
| Orchestrator graph protected | Done | Requires Bearer in production |

**Exit:** See [`docs/security.md`](./security.md) pre-deploy checklist.

**Next:** Phase P4 — integrations (in progress).

---

### Phase P3 — Async operations & scale (Done)

**Outcome:** Ingest returns fast; heavy work is durable.

| Item | Status | Notes |
|------|--------|--------|
| `processing_status` lifecycle | Done | `pending` → `processing` → `completed` / `failed` |
| Background worker | Done | Next.js `after()` + `runQueuedTransactionInBackground` |
| Ingest API: 202 + poll status | Done | `?async=true`, `GET …/status`, Dev ingest UI on Settings |
| Bulk CSV import API + UI | Done | `POST /api/ingest/transactions/bulk`, Settings panel |
| Dead-letter + retry policy | Done | Postgres-backed retry + `dead_letter`; cron drain — see [`async-processing.md`](./async-processing.md) |

**Exit:** p95 ingest ACK &lt; 500ms; p95 decision &lt; 30s async.

---

### Phase P4 — Integrations & full use case (In progress)

**Outcome:** Real finance team daily loop without CLI.

| Item | Status | Notes |
|------|--------|--------|
| Webhook async ingest (202 default) | Done | `WEBHOOK_ASYNC_DEFAULT` — see `docs/webhook-ingest.md` |
| NL policy compiler (admin) | Done | `POST /api/policies/compile`, `/policy` UI |
| QuickBooks sandbox OAuth (connect + tokens) | Done | Settings connect; stub journal post when connected |
| QuickBooks real journal API / Xero OAuth | Done (QB) | Token refresh + QBO JournalEntry — see [`quickbooks-erp.md`](./quickbooks-erp.md) |
| Xero OAuth | Planned | |
| Email/Slack receipt chase (mock → provider) | Done | `ReceiptChaseSent` events; `GET /api/receipt-chases` |
| AP cash forecast + funding narrative | Done | Deterministic forecast + rationale — `GET /api/ap/cash-forecast` |
| Hybrid retrieval (BM25 + vector) | Deferred | When recall@5 &lt; target |

**Exit:** One sandbox ERP tenant E2E: card txn → tag → ERP → invoice → AP recommend.

---

### Phase P5 — Enterprise & SRE (In progress)

| Item | Status | Notes |
|------|--------|--------|
| Playwright E2E | Done | `pnpm test:e2e` — smoke, async ingest, review override |
| SSO (Clerk) + RBAC | Done | Memberships + role gates — see [`sso-rbac.md`](./sso-rbac.md) |
| Postgres RLS by `tenant_id` | Done | `0006_tenant_rls` + `runWithTenantRls` — see [`tenant-rls.md`](./tenant-rls.md) |
| Langfuse / OTel dashboards | Done | Graph-step spans + Settings SLO panel — [`langfuse-setup.md`](./langfuse-setup.md) |
| CI eval gate on PR (block merge on regression) | Done | `pnpm eval:gate` after `pnpm eval:tagging` |
| Multi-region / DR notes | Done | [`multi-region-dr.md`](./multi-region-dr.md) |

---

## What to build next (recommended)

**Now:** P5 complete — next focus showcase freeze prep (`docs/demo-script.md`, `pnpm eval:gate`, dry-runs).  

P1–P5 shipped (SSO/RBAC, Langfuse export + SLO dashboard, DR runbook).

---

## Commands (target steady state)

```bash
# Local
docker compose up -d && pnpm db:migrate && pnpm db:seed
pnpm dev

# Pre-deploy
pnpm production:check
pnpm showcase:prep          # still valid as full quality gate

# Production smoke
curl -s "$APP_URL/api/health"
curl -s "$APP_URL/api/ready"
```

---

## Success metrics (production)

| Metric | Target |
|--------|--------|
| CI pass rate on `main` | 100% |
| AUTO_TAG precision (eval) | ≥ 95% held-out |
| Cross-tenant data leak | 0 |
| Uptime (ready probe) | 99.5%+ |
| p95 async ingest → decision | &lt; 30s |
| Mean LLM cost per tagged txn | Tracked in audit; alert on spike |

---

_Update this file when a phase row ships — same PR as the feature._
