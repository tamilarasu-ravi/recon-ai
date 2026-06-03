# E2E tests (Playwright)

Operator flows without the browser console.

## Prerequisites

- Postgres running (`docker compose up -d`)
- Migrations + seed run automatically via `global-setup`

## Run locally

```bash
pnpm playwright:install   # once — downloads Chromium
pnpm test:e2e             # starts `pnpm dev` with auth disabled (stop other dev servers first)
pnpm test:e2e:ui    # interactive UI mode
```

Env (defaults in `playwright.config.ts`):

- `DATABASE_URL` — default `localhost:5434` for local Docker
- `PLAYWRIGHT_BASE_URL` — default `http://localhost:3000`

## Specs

| File | Flow |
|------|------|
| `smoke.spec.ts` | Home, review queue, `/api/health` |
| `async-ingest.spec.ts` | Settings → Dev ingest (async) → `completed` |
| `review-override.spec.ts` | API ingest MYSTERY vendor → queue → override GL |

CI runs the same suite in `.github/workflows/ci.yml` (`e2e` job).
