# Langfuse setup (optional)

Mirrors `audit_log` rows to [Langfuse](https://langfuse.com) when credentials are set. **No-op** when keys are missing — local dev and eval work unchanged.

## Configure

Add to `.env` (see `.env.example`):

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
```

## Behavior

- Each `appendAuditLog` call exports a **trace** with `id = run_id` (correlates with Postgres `events` / `audit_log`).
- When `cost_usd` / `model` appear in observability, a child **generation** span is attached.
- Failures are logged to stderr only; they never fail the pipeline.

## Verify

```bash
pnpm demo
```

Open Langfuse → Traces → filter by recent timestamps. Trace names: `tagging-run`, `policy-run`, `ap-run`, etc.

## Note

This project uses the Langfuse **v3** Node SDK (`langfuse` package). Langfuse v4+ uses OpenTelemetry; upgrade post-capstone if needed.
