# Async transaction processing (P3 durable queue)

Production async ingest returns **202** immediately and runs tagging in the background. Failures are **retried with backoff**; exhausted attempts move to **dead_letter**.

## Lifecycle

```text
pending → processing → completed
        ↘ (error) → pending (retry scheduled) → … → dead_letter
        ↘ (stale processing >15m) → reclaimed by worker
```

| Status | Meaning |
|--------|---------|
| `pending` | Queued; worker runs when `processing_next_retry_at` is null or in the past |
| `processing` | Pipeline in flight |
| `completed` | Tagging finished (may still need HITL approval) |
| `failed` | Legacy terminal state (prefer retry → `pending` or `dead_letter`) |
| `dead_letter` | Max attempts exceeded; requires manual reprocess |

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PROCESSING_MAX_ATTEMPTS` | `3` | Automatic retries before dead-letter |
| `CRON_SECRET` | — | Protects worker cron route |

Backoff: 30s → 120s → 480s (×4 per attempt).

## APIs

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/cron/process-pending-transactions` | `Authorization: Bearer $CRON_SECRET` or `X-Cron-Secret` |
| `GET` | `/api/transactions/processing-failures?tenant_id=` | Tenant API key |
| `POST` | `/api/transactions/{id}/reprocess?tenant_id=` | Tenant API key |
| `GET` | `/api/transactions/{id}/status?tenant_id=` | Tenant API key (includes `attempt_count`, `last_error`, `next_retry_at`) |

### Cron (Vercel)

Add to `vercel.json` when `CRON_SECRET` is set in production:

```json
{
  "crons": [
    {
      "path": "/api/cron/process-pending-transactions",
      "schedule": "0 0 * * *"
    }
  ]
}
```

**Vercel Hobby:** cron jobs may run **at most once per day** — use `0 0 * * *` (midnight UTC), not `* * * * *`. Pro plan allows per-minute schedules for faster retry drain.

For faster drain on Hobby, trigger manually:


```bash
curl -X POST http://localhost:3000/api/cron/process-pending-transactions \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Operations

1. **List failures:** `GET /api/transactions/processing-failures?tenant_id=…`
2. **Replay:** `POST /api/transactions/{id}/reprocess?tenant_id=…` with body `{ "run_immediately": true }`
3. **Audit:** events `TransactionProcessingFailed`, `TransactionProcessingDeadLetter`

## Limitations (next iteration)

- Retry drain is **Postgres-polled**, not Redis/SQS (fine for moderate volume).
- Rate limits remain **per serverless instance** until Upstash (P5).
