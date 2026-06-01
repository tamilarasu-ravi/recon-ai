# MCP server setup

Thin **Model Context Protocol** server exposing the same platform operations as the REST API and UI.

## Run

```bash
docker compose up -d
pnpm db:seed
pnpm mcp
```

Server uses **stdio** transport — configure in Cursor MCP settings.

## Cursor config example

Add to `.cursor/mcp.json` (project) or user MCP config:

```json
{
  "mcpServers": {
    "recon-ai": {
      "command": "pnpm",
      "args": ["mcp"],
      "cwd": "/absolute/path/to/recon-ai",
      "env": {
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5434/cfo_capstone",
        "LLM_ENABLE_LIVE_CALLS": "false"
      }
    }
  }
}
```

Use your real `DATABASE_URL` from `.env`. Do not commit secrets.

## Tools

| Tool | Description |
|------|-------------|
| `list_tenants` | Seeded tenant-a / tenant-b |
| `ingest_transaction` | Full tagging pipeline |
| `get_review_queue` | Open review items |
| `submit_override` | GL override + vendor rule |
| `upload_receipt` | Mock receipt → clears receipt gate |
| `reprocess_tagging` | Re-tag after receipt |

## Notes

- Logs go to **stderr** only (stdio is JSON-RPC).
- Same orchestrator code paths as `POST /api/*` routes.
