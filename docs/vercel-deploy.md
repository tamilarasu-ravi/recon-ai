# Vercel + Neon deploy (optional showcase URL)

Deploy the Next.js app to **Vercel** with **Neon Postgres** (pgvector). Local Docker remains the default for dev; production uses a pooled `DATABASE_URL`.

## Prerequisites

- [Vercel](https://vercel.com) account
- [Neon](https://neon.tech) project with **pgvector** enabled (`CREATE EXTENSION IF NOT EXISTS vector;`)
- `vercel` CLI: `pnpm dlx vercel@latest login`

## 1. Neon database

1. Create a Neon project (region near your audience).
2. Enable pgvector in the SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Copy the **pooled** connection string (host contains `-pooler`).
4. Run migrations and seed **once** from your machine:
   ```bash
   export DATABASE_URL="postgresql://...@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
   pnpm db:migrate
   pnpm db:seed
   ```

## 2. Vercel project

From repo root:

```bash
pnpm dlx vercel@latest link
pnpm dlx vercel@latest env pull .env.vercel.local   # optional local preview
```

## 3. Environment variables (Vercel dashboard)

Set for **Production** and **Preview**:

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | Neon **pooled** URL (`-pooler`) |
| `LLM_PROVIDER` | `google` |
| `GOOGLE_API_KEY` | Required if live LLM on deploy |
| `LLM_ENABLE_LIVE_CALLS` | `false` for cheap demo; `true` for live tagging |
| `TAG_AUTO_THRESHOLD` | `0.92` |
| `TAG_REVIEW_THRESHOLD` | `0.75` |
| `LANGFUSE_*` | Optional — see [langfuse-setup.md](./langfuse-setup.md) |
| `CRON_SECRET` | Optional — protects `/api/cron/process-pending-transactions` |
| `RLS_USE_APP_ROLE` | `false` for Neon |

Do **not** commit production secrets.

## 4. Deploy

```bash
pnpm dlx vercel@latest --prod
```

Or connect the GitHub repo in the Vercel dashboard for auto-deploy on push.

## 5. Production env (required for public deploy)

Set in Vercel **Production**:

| Variable | Value |
|----------|--------|
| `REQUIRE_API_AUTH` | `true` |
| `NODE_ENV` | `production` (automatic on Vercel) |

Run locally before deploy:

```bash
NODE_ENV=production REQUIRE_API_AUTH=true pnpm production:check
```

## 6. Smoke test

```bash
curl -s https://YOUR_APP.vercel.app/api/health | jq
curl -s https://YOUR_APP.vercel.app/api/ready | jq
curl -s -H "Authorization: Bearer YOUR_KEY" https://YOUR_APP.vercel.app/api/tenants | jq
```

Open `https://YOUR_APP.vercel.app/review-queue` after seeding tenants.

## 6. Showcase tips

- Prefer **`LLM_ENABLE_LIVE_CALLS=false`** on preview if API quota is tight; run golden path locally with `pnpm demo`.
- Ingest routes use `maxDuration = 60` — Hobby plan may cap lower; use local demo as backup ([showcase-checklist.md](./capstone/showcase-checklist.md)).
- Add preview URL to slide deck as “optional live UI.”

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `DATABASE_URL is required` | Set env in Vercel project settings; redeploy |
| Connection pool errors | Use **pooled** Neon URL; client sets `prepare: false` on Vercel |
| Empty review queue | Run `pnpm db:seed` against Neon `DATABASE_URL` |
| LLM timeout | Set `LLM_ENABLE_LIVE_CALLS=false` or upgrade Vercel plan |
| Cron Hobby limit error | `vercel.json` cron must be **once per day** (`0 0 * * *`); remove `crons` block or upgrade to Pro for `* * * * *` |
| `ERR_INVALID_THIS` / `URLSearchParams` on `pnpm install` | Commit `pnpm-lock.yaml`; `package.json` pins `pnpm@10.15.0` via Corepack. Remove `ENABLE_EXPERIMENTAL_COREPACK=1` from Vercel env if set |
