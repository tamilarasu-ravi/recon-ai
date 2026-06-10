# Webhook ingest (Phase 2)

External systems can push card transactions into ReconAI with **HMAC-SHA256** signed payloads. The same LangGraph tagging pipeline runs as `POST /api/ingest/transactions`.

## Setup

```bash
pnpm db:migrate
pnpm db:seed
```

Seed prints a `whsec_…` signing secret per tenant. Store it in your integration vault (or `.env` for local demos):

```bash
WEBHOOK_DEMO_SECRET=whsec_...
```

## Endpoint

```http
POST /api/webhooks/transactions?tenant_slug=tenant-a
Content-Type: application/json
X-Recon-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>
```

Signed payload string: `` `${timestamp}.${rawBody}` `` (HMAC key = webhook signing secret).

### Body (no tenant_id — tenant comes from URL)

```json
{
  "external_transaction_id": "card-txn-001",
  "transaction_timestamp": "2026-06-01T12:00:00.000Z",
  "amount": "99.00",
  "currency": "USD",
  "vendor_raw": "AWS",
  "memo": "ec2"
}
```

### Responses

By default webhooks return **202** immediately and run tagging in the background (`WEBHOOK_ASYNC_DEFAULT=true`). Poll `GET /api/transactions/{id}/status?tenant_id=…` or open the transaction in the UI.

| Status | Meaning |
|--------|---------|
| `202` | Accepted — `processingStatus: pending` (async default) |
| `201` | Sync path (`?async=false`) — tagging finished in request |
| `200` | Duplicate idempotency hit |
| `401` | Bad or missing signature |

## Local demo

With `pnpm dev` running:

```bash
pnpm db:migrate && pnpm db:seed   # once, creates whsec per tenant
pnpm webhook:demo                 # loads secret from DB if WEBHOOK_DEMO_SECRET unset
```

Optional override: `WEBHOOK_DEMO_SECRET=whsec_…` from seed log or Settings.

## Manage secrets

- **Settings UI** — create/list masked webhook secrets (`/settings`)
- **API** — `GET/POST /api/webhook-secrets?tenant_id=…` (requires API auth when enabled)

## Security notes

- Signing secrets are stored server-side for HMAC verification (sandbox). Production should use a secrets manager or envelope encryption.
- Optional replay window: `WEBHOOK_SIGNATURE_TOLERANCE_SEC` (default `300`).
- Webhook routes do **not** use Bearer API keys; signature + tenant slug scope the request.

## Related

- REST ingest: `POST /api/ingest/transactions`
- API keys: `docs/mcp-setup.md` and Settings
