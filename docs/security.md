# Security — ReconAI (P2)

Production hardening for public deployment. Build order: [`production-roadmap.md`](./production-roadmap.md).

---

## Authentication

| Surface | Mechanism |
|---------|-----------|
| REST API (`/api/*` except health/ready/webhooks) | `Authorization: Bearer <api_key>` when `REQUIRE_API_AUTH=true` **or** `VERCEL_ENV=production` |
| Webhooks | HMAC-SHA256 (`X-Recon-Signature`) per tenant — no Bearer token |
| Browser UI | API key in `sessionStorage` via Settings → sent by `apiFetch()` |

**Production rule:** set `REQUIRE_API_AUTH=true` on Vercel. `pnpm production:check` validates this.

### Tenant isolation

- API keys are scoped to one `tenant_id`.
- `assertTenantScope` returns **403** when `tenant_id` in query/body does not match the key.
- `GET /api/tenants` returns **only the key's tenant** when auth is required (no global tenant enumeration).
- **Postgres RLS** (`FORCE ROW LEVEL SECURITY` on tenant tables): handlers use `withTenantAccess` / `runWithTenantRls`; cron and auth use `runWithRlsBypass`. See [`tenant-rls.md`](./tenant-rls.md).

### UI bootstrap (first API key)

When `REQUIRE_API_AUTH=true` and no key is in the browser yet:

1. Open **Settings** — blue info banner explains bootstrap.
2. Choose **Tenant** (`tenant-a` / `tenant-b`).
3. Click **Generate key** (allowed only if that tenant has **zero** keys in the DB).
4. Key is auto-saved to sessionStorage; tenant list reloads.

If seed already created keys, use the key printed by `pnpm db:seed`, or delete rows from `api_keys` and generate again.

---

## Rate limiting (in-memory per instance)

Configured via environment (requests per 60s window):

| Variable | Default | Applies to |
|----------|---------|------------|
| `RATE_LIMIT_INGEST_PER_MIN` | 60 | Transaction + invoice ingest |
| `RATE_LIMIT_WEBHOOK_PER_MIN` | 120 | Webhook ingest (per tenant slug + IP) |
| `RATE_LIMIT_API_PER_MIN` | 300 | All authenticated tenant API routes |

Exceeded limits return **429** with `Retry-After`.

> **Note:** Limits are per serverless instance. For strict global limits, add Redis/Upstash in P5.

---

## HTTP headers

Set on all routes via `next.config.ts`:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera/mic/geo disabled)

---

## Secrets

- Never commit `.env` or raw API keys.
- Do not use `NEXT_PUBLIC_*` for secrets — UI reads `GET /api/settings/public` for display flags only.
- Webhook signing secrets: prefix `whsec_`, stored hashed in `webhook_secrets`.

---

## Route audit (P2)

| Route | Auth | Rate limit |
|-------|------|------------|
| `/api/health` | Public | — |
| `/api/ready` | Public | — |
| `/api/webhooks/transactions` | HMAC | Webhook |
| `/api/tenants` | Bearer in prod | — |
| `/api/orchestrator/graph` | Bearer in prod | — |
| `/api/settings/public` | Public (no secrets) | — |
| `/api/cron/process-pending-transactions` | `CRON_SECRET` (Bearer or `X-Cron-Secret`) | — |
| All other `/api/*` | Bearer + tenant scope | Tenant API + ingest where applicable |

---

## Pre-deploy checklist

```bash
NODE_ENV=production REQUIRE_API_AUTH=true pnpm production:check
curl -s "$APP/api/ready" | jq
curl -s -H "Authorization: Bearer $KEY" "$APP/api/tenants" | jq   # single tenant only
```

---

## Planned (P3+)

- Redis-backed global rate limits
- CORS allowlist env for third-party integrators
- SSO / RBAC replacing demo tenant picker
