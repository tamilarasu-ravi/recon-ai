# Postgres row-level security (tenant isolation)

Defense in depth on top of API `tenant_id` checks. Every tenant-scoped table enforces `FORCE ROW LEVEL SECURITY` policies keyed off session variables set per request or script.

## Session variables

| GUC | Set by | Effect |
|-----|--------|--------|
| `app.tenant_id` | `runWithTenantRls(tenantId, …)` | Rows where `tenant_id` (or `tenants.id`) match |
| `app.rls_bypass` | `runWithRlsBypass(…)` | Full access (cron, seed, eval cleanup, API key lookup) |

Policies are defined in `drizzle/0006_tenant_rls.sql` via `app_rls_tenant_match(tenant_id)` and an inline policy on `tenants.id`.

## Application usage

- **Tenant APIs:** `withTenantAccess()` in `src/lib/api/tenant-auth.ts` — auth under bypass, handler under `app.tenant_id`.
- **Webhooks:** bypass for secret lookup; ingest under tenant scope.
- **Cron worker:** `runWithRlsBypass` in `process-pending-transactions` (multi-tenant drain).
- **Background ingest:** `runWithTenantRls` in `queue-transaction-ingest`.
- **CLI:** `pnpm db:seed` and `pnpm eval:tagging` use bypass + per-case tenant scope.

Inside a scope, use `getDb()` (not a separate `createDb()` client) so queries hit the scoped transaction.

## Migrate

```bash
pnpm db:migrate   # applies 0006_tenant_rls
```

## Verify

```bash
pnpm test                                    # unit tests
node --import tsx --test tests/integration/tenant-rls.test.ts   # needs DATABASE_URL + seed
```

## Operational notes

- **Superusers bypass RLS** even with `FORCE ROW LEVEL SECURITY`. Local Docker uses `postgres`; migration `0007_recon_app_role` creates `recon_app` (password `recon_app_dev`), and each scoped transaction runs `SET LOCAL SESSION AUTHORIZATION recon_app` when the connection is a superuser. `RLS_USE_APP_ROLE=false` skips the switch only for non-superuser URLs (Neon/Vercel).
- Production (Neon): use a non-superuser connection string — RLS applies without `SET ROLE`.
- Table owner / superuser bypasses RLS in Postgres; app role should not be superuser in production.
- Connection poolers must preserve transaction-local `SET LOCAL` (Neon pooler: use transaction mode or direct connection for RLS transactions).
- New tenant-scoped tables need policies in a follow-up migration.

See also [`security.md`](./security.md) and [`production-roadmap.md`](./production-roadmap.md) Phase P5.
