# QuickBooks ERP integration (P4)

Sandbox OAuth connect + real **JournalEntry** API posts when `ERP_PROVIDER=quickbooks_sandbox` and the tenant has connected QuickBooks.

## Setup

1. Create an app at [Intuit Developer](https://developer.intuit.com) (sandbox).
2. Set redirect URI: `http://localhost:3000/api/erp/callback/quickbooks` (or your deploy URL).
3. Configure env (see `.env.example`):

```bash
ERP_PROVIDER=quickbooks_sandbox
QUICKBOOKS_CLIENT_ID=...
QUICKBOOKS_CLIENT_SECRET=...
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/erp/callback/quickbooks
QUICKBOOKS_OFFSET_ACCOUNT_ID=...   # QBO credit account (e.g. credit card liability)
# or QUICKBOOKS_OFFSET_GL_CODE=2100
```

4. Settings → connect QuickBooks for the tenant.
5. Map tenant CoA `gl_code` values to QBO **AcctNum** or **Name** (debit/expense side).
6. Post: `POST /api/erp/post` with `tenant_id` + `transaction_id` (AUTO_TAG only).

## Token refresh

Access tokens refresh automatically via `ensureQuickBooksSession()` when within 5 minutes of expiry (`QUICKBOOKS_TOKEN_REFRESH_BUFFER_MS`). New tokens are persisted to `erp_connections`.

## Local stub

Set `QUICKBOOKS_JOURNAL_STUB=true` to skip QBO API writes and return synthetic `qb-…` external ids (previous behavior).

## Flow

```text
AUTO_TAG txn → syncAutoTagToErp → QuickBooksSandboxAdapter
  → ensureQuickBooksSession (refresh if needed)
  → resolveQuickBooksAccountId (debit = tagged GL, credit = offset)
  → POST /v3/company/{realmId}/journalentry
  → persist erp_external_id + ErpTransactionPosted event
```

See also [`production-roadmap.md`](./production-roadmap.md) Phase P4.
