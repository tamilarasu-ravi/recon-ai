# SSO & RBAC (P5)

Clerk sign-in for the operator UI, with per-tenant roles stored in Postgres. API keys remain for programmatic access.

## Enable SSO

1. Create a Clerk application at [clerk.com](https://clerk.com) (or Vercel Marketplace integration).
2. Add to `.env`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

3. Run migrations: `pnpm db:migrate`
4. Sign in once, copy your user id from Clerk dashboard or `GET /api/me`.
5. Seed memberships:

```bash
CLERK_SEED_USER_ID=user_xxx pnpm auth:seed-memberships
```

Default seed: **admin** on `tenant-a`, **accountant** on `tenant-b`.

## Roles

| Role | Permissions |
|------|-------------|
| **viewer** | Read queue, transactions, policy, AP |
| **accountant** | + ingest, override, receipts, reprocess |
| **admin** | + policy compile/edit, API keys, webhooks, ERP connect |

API keys authenticate as **admin** for their tenant (M2M).

## Auth modes

| Mode | UI | API |
|------|----|-----|
| Open dev | Tenant picker, no sign-in | No key required |
| `REQUIRE_API_AUTH=true` | API key in sessionStorage (Settings) | Bearer key |
| Clerk configured | Sign in + membership-scoped tenants | Session cookie **or** Bearer key |

`REQUIRE_API_AUTH=true` and Clerk can run together: browser uses session; scripts use API keys.

## Tables

- `tenant_memberships` — `clerk_user_id`, `tenant_id`, `role` (RLS: bypass-only reads/writes)

See also [`security.md`](./security.md) and [`tenant-rls.md`](./tenant-rls.md).
