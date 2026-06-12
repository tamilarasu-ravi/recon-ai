# Demo script (3–5 minutes)

**Prereqs:** Postgres seeded (`pnpm db:seed` locally, or seeded Neon on Vercel).  
Use **localhost:3000** or your **public Vercel URL**. API key optional if `LLM_ENABLE_LIVE_CALLS=false`.

## Option A — One command (CLI)

```bash
pnpm demo
```

Walk through the nine printed steps (tagging, receipt, override, AP duplicate, **REFUSE**).

---

## Option D — Vendor rule learning (UI — “skill reuse”)

**Time:** ~2 minutes · **Tenant:** `tenant-a` · **Beat:** override once → system remembers → second txn auto-codes

This mirrors `pnpm demo` steps 4–6 and is the best UI story for *“every correction becomes a reusable rule.”*

### Before you start

1. Open the app (local or Vercel).
2. Select company **tenant-a** in the header tenant switcher.
3. Optional: run `pnpm demo` once in terminal to warm the DB — not required if you follow the steps below.

### Step 1 — First Zephyr transaction (no rule yet)

1. Go to **Review queue** → **Add transaction** (`/review-queue/new`).
2. Scenario preset: leave **Custom** or pick any preset and edit fields.
3. Set:
   - **Vendor:** `Zephyr Labs LLC` (type in custom vendor field if not in dropdown)
   - **Amount:** `1200.00`
   - **Memo:** `consulting`
4. Submit ingest (sync is fine for demo).
5. When processing completes, open the transaction from the review queue or ingest result link.

**Say:** “New vendor — no rule yet. We queue or refuse rather than silently miscoding.”

**Expect:** `QUEUE_REVIEW` (or similar mid-confidence outcome). Note decision badge on detail page.

### Step 2 — Accountant override → vendor rule

On **transaction detail** (`/transactions/[id]`):

1. Scroll to **Accountant override**.
2. Choose **GL 6200** (Professional Services) from the CoA dropdown.
3. Click **Apply override**.

**Say:** “The accountant teaches the system once. We persist a deterministic vendor rule — not fine-tuning, fully auditable.”

**Expect:** Success message; audit shows vendor rule created.

Optional: open **Run trace** and point at override / rule persistence step.

### Step 3 — Replay same vendor (rule hit)

1. Return to **Add transaction** (`/review-queue/new`).
2. Ingest a **second** transaction:
   - **Vendor:** `Zephyr Labs LLC` (same spelling)
   - **Amount:** `50.00`
   - **Memo:** `follow-on consulting`
3. Open the new transaction detail when ready.

**Say:** “Same vendor — rule hits first. LLM can be skipped; decision is AUTO_TAG to GL 6200 with high confidence.”

**Expect:** Decision **Auto-coded** (`AUTO_TAG`). In **Run trace**, look for rule-first path / `llm_skipped` or vendor rule step.

**CLI equivalent (same flow):** `pnpm demo` steps 4–6.

---

## Option B — Full UI tour (5 minutes)

```bash
pnpm dev   # skip if using Vercel
```

Open **Review queue** — use detail panels for RAG neighbors and run trace. Combine with **Option D** above for the learning-loop highlight.

| # | Beat | Where |
|---|------|-------|
| 1 | Platform hub | `/` |
| 2 | AUTO_TAG + vendor rule | Review queue → **Slack** |
| 3 | Receipt gate | **AWS $99** preset → receipt → **Reprocess** (modal opens) |
| 4 | **Learning loop** | **Option D** (Zephyr → override → replay) |
| 5 | REFUSE | Switch to **tenant-b**, ingest **Unknown Courier 42** |
| 6 | Orchestrator | `/orchestrator` |
| 7 | AP | `/ap` → recommendation + duplicate |
| 8 | Audit | Transaction detail → **Run history** (expand run) + **Pipeline steps** modal |

---

## Option E — Agentic evidence (develop / preview only)

**Time:** ~1 minute · **Requires:** `AGENTIC_EVIDENCE_ENABLED=true` (Vercel preview on `develop`, or local `.env`)

1. Open **tenant-a** → find an **AWS** or **Slack** transaction (vendor rule exists).
2. Scroll to **Receipt** → click **Reprocess only** (or upload receipt → reprocess on AWS).
3. **Pipeline trace modal** opens — watch steps stream (or replay when complete):
   - **Evidence plan** — tools selected (`vendor_rules`, optional `policy_context`)
   - **RAG retrieval skipped** — `vendor_rule_sufficient` when rule + known vendor
   - **Evidence verify** — heuristic concerns (if any)
4. Close modal → **Run history** on detail shows the same run with domain events.
5. Compare with **Zephyr** (cold start) — planner should include `similar_transactions`.

**Say:** “The planner decides which evidence to gather — we skip expensive retrieval when the vendor rule is enough. Tri-state gates and CoA checks are unchanged.”

**Eval proof:** `pnpm eval:tagging` with flag on → ~60% retrieval skipped, 30/30 pass (see `docs/eval-results.md`).

---

## Option C — Live API only

Replace `http://localhost:3000` with your Vercel URL when demoing production.

```bash
pnpm dev   # skip if calling Vercel URL
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

### 4. Learning loop (override) — API variant of Option D

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

See README **Eval proof** table and [`docs/eval-results.md`](./eval-results.md): 30 cases, 100% pass, 100% auto-tag precision, red-team case-08 safe. Re-run: `pnpm eval:tagging`.
