# Demo script (3–5 minutes)

**Prereqs:** `docker compose up -d`, `pnpm db:seed`, `.env` with `GOOGLE_API_KEY` (or `LLM_ENABLE_LIVE_CALLS=false` for faster deterministic run).

## Option A — One command

```bash
pnpm demo
```

Walk through the nine printed steps (tagging, receipt, override, AP duplicate, **REFUSE**).

## Option B — UI + API (for showcase)

```bash
pnpm dev
```

Open **http://localhost:3000/review-queue** — click a card to open transaction detail. On detail, use **Label memory (RAG)** to see top‑k similar labeled transactions (similarity + GL) for the selected run, then **Run trace** for graph steps. Run `pnpm demo` first to populate queue items.

## Option C — Live API only

```bash
pnpm dev
```

### 1. Tenants

```bash
curl -s http://localhost:3000/api/tenants | jq
```

Use `tenant-a` `id` as `$TENANT_ID`.

### 2. Auto-tag (under receipt threshold)

```bash
curl -s -X POST http://localhost:3000/api/ingest/transactions \
  -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"external_transaction_id\":\"live-slack-1\",\"transaction_timestamp\":\"2026-06-01T12:00:00Z\",\"amount\":\"55.00\",\"currency\":\"USD\",\"vendor_raw\":\"Slack\"}" | jq
```

**Say:** Rule hit + confidence → `AUTO_TAG` to GL 6100.

### 3. Receipt gate

```bash
curl -s -X POST http://localhost:3000/api/ingest/transactions \
  -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"external_transaction_id\":\"live-aws-99\",\"transaction_timestamp\":\"2026-06-01T12:00:00Z\",\"amount\":\"99.00\",\"currency\":\"USD\",\"vendor_raw\":\"AWS\"}" | jq
```

**Say:** Policy `FLAG_RECEIPT` → `QUEUE_REVIEW` until receipt uploaded.

Upload receipt, then reprocess:

```bash
curl -s -X POST http://localhost:3000/api/receipts -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"transaction_id\":\"<TXN_ID>\",\"receipt_text\":\"AWS invoice demo\"}" | jq

curl -s -X POST http://localhost:3000/api/transactions/<TXN_ID>/reprocess \
  -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT_ID\"}" | jq
```

### 4. Learning loop (override)

Ingest Zephyr → override GL 6200 → ingest again with same vendor.

```bash
curl -s -X POST http://localhost:3000/api/transactions/<TXN_ID>/override \
  -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"gl_code\":\"6200\"}" | jq
```

### 5. Review queue UI hook

```bash
curl -s "http://localhost:3000/api/review-queue?tenant_id=$TENANT_ID&status=open" | jq
```

### 6. AP recommend-only + duplicate

```bash
curl -s -X POST http://localhost:3000/api/ingest/invoices \
  -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT_ID\",\"external_invoice_id\":\"live-inv-1\",\"vendor_raw\":\"aws\",\"amount\":\"500.00\",\"currency\":\"USD\",\"invoice_date\":\"2026-05-15T00:00:00Z\"}" | jq
```

Repeat same vendor/amount/date → **409 duplicate**, audit “would pay” only.

## Backup slide — REFUSE (step 9 in `pnpm demo`)

**Say:** “We refuse to guess GL on explicitly unknown merchants — better than silent miscoding.”

Demo step 9 ingests `Unknown Courier 42` on **tenant-b** → `REFUSE` with reason `unknown_vendor_pattern`. Show in UI: `/review-queue` (tenant-b) or transaction detail.

Manual ingest:

```bash
curl -s -X POST http://localhost:3000/api/ingest/transactions \
  -H "Content-Type: application/json" \
  -d "{\"tenant_id\":\"$TENANT_B_ID\",\"external_transaction_id\":\"live-refuse-1\",\"transaction_timestamp\":\"2026-06-01T12:00:00Z\",\"amount\":\"60.00\",\"currency\":\"USD\",\"vendor_raw\":\"Unknown Courier 42\"}" | jq
```

## Eval mention

`pnpm eval:tagging` — 30 golden cases, **100% pass**, **100% auto-tag precision**, red-team case-08 safe. See `docs/eval-results.md`.
