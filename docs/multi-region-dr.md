# Multi-region & disaster recovery (production notes)

**Scope:** Post-capstone operations guide — not implemented in the POC runtime.  
**Related:** [`production-at-scale.md`](./production-at-scale.md) · [`vercel-deploy.md`](./vercel-deploy.md) · [`tenant-rls.md`](./tenant-rls.md)

---

## Current POC posture

| Concern | Today | Production target |
|---------|--------|-------------------|
| **Primary DB** | Single Postgres (Docker local / Neon prod) | Managed Postgres with automated backups |
| **App tier** | Vercel serverless (single region default) | Multi-region edge optional; state in DB |
| **Secrets** | `.env` / Vercel env | Secret manager + rotation runbook |
| **Audit replay** | `events` + `audit_log` + `run_id` | Same + cross-region read replica for analytics |
| **RTO / RPO** | Best-effort (dev) | Define per tenant SLA (see below) |

---

## Recommended production topology

```text
                    ┌─────────────────┐
   Users ─────────► │ Vercel (primary │──► Neon Postgres (primary, region A)
                    │  region)        │         │
                    └─────────────────┘         ├── read replica (region B, analytics)
                                                └── PITR backups (7–35 days)
```

- **Write path:** orchestrator + `audit_log` stay on primary region to avoid split-brain.
- **Read path:** review queue, metrics, Langfuse export can use read replica with **≤1 min lag** acceptance for dashboards only — never for mutating tagging decisions.
- **pgvector:** keep embeddings co-located with transactions table; do not split vector index across regions without explicit replication design.

---

## Disaster recovery tiers

| Tier | RPO | RTO | Mechanism |
|------|-----|-----|-----------|
| **A — Config** | 0 | &lt; 1 h | Vercel env + IaC in git; `pnpm production:check` before promote |
| **B — Data** | &lt; 15 min | &lt; 4 h | Neon PITR restore to new branch; update `DATABASE_URL` |
| **C — Region** | &lt; 1 h | &lt; 24 h | Promote read replica or restore backup in secondary region; DNS cutover |

### Restore drill (quarterly)

1. Restore Neon branch from PITR to staging `DATABASE_URL`.
2. Run `pnpm db:migrate` (should be no-op if schema matches).
3. `curl $STAGING/api/ready` — verify pgvector extension.
4. `pnpm eval:tagging` with `LLM_ENABLE_LIVE_CALLS=false` — golden replay.
5. `pnpm demo` — one E2E ingest path.
6. Document actual RTO in postmortem template.

---

## Multi-tenant isolation under failure

- **RLS** (`0006_tenant_rls`) must remain enabled on app role after any restore.
- **Never** replay `events` across tenants — `run_id` + `tenant_id` are composite keys for audit.
- Cross-region replicas: enforce same `tenant_id` predicates; no global cache of GL labels without tenant scope.

---

## Langfuse & observability during outage

| Failure | Behavior |
|---------|----------|
| Langfuse unreachable | `scheduleLangfuseExport` logs stderr; pipeline continues; `audit_log` is source of truth |
| LLM provider outage | Existing capstone pattern → `QUEUE_REVIEW` / retry; see `production-at-scale.md` §8 |
| Primary DB down | `/api/ready` fails; Vercel returns 503; cron worker pauses |

SLO targets (see Settings → Observability):

- **p95 decision latency** ≤ 30s (graph step sum from `audit_log`)
- **AUTO_TAG precision** ≥ 95% (`pnpm eval:gate` in CI)

---

## What not to do

- Active-active writes in two regions without conflict resolution for `transactions` / `events`.
- Restoring prod backup into dev without scrubbing PII and rotating API keys.
- Disabling RLS for “performance” on read replicas used by the app tier.

---

## Checklist before multi-region

- [ ] Neon (or equivalent) PITR enabled and restore tested
- [ ] `CRON_SECRET` + worker idempotency verified after restore
- [ ] Clerk / SSO redirect URLs updated for staging DR domain
- [ ] QuickBooks OAuth tokens re-authorized if realm IDs change
- [ ] `docs/eval-results.md` baseline captured pre-cutover

_Update when DR drill completes — link runbook in `production-roadmap.md`._
