# Stretch roadmap (ahead of schedule — June 2026)

You are **feature-complete** for the 3-week tier before the calendar says so. Use extra time for **standard tier** polish and showcase prep—not new hero scope.

## Done early (calendar Jun 7–10 work)

- Review queue + transaction UI, override, audit trace
- `pnpm eval:tagging` 100% pass, REFUSE + red-team
- `pnpm demo` (9 steps), showcase deck, dry-run checklist, code-freeze doc

## Stretch tier (Jun 2–9 calendar — in progress)

| Item | Status | Command / doc |
|------|--------|----------------|
| Receipt upload in UI | Done | `/transactions/[id]` |
| Thin MCP server | Done | `pnpm mcp`, [mcp-setup.md](./mcp-setup.md) |
| Langfuse traces | Done | [langfuse-setup.md](./langfuse-setup.md) |
| Vercel + Neon deploy | Optional | Post-demo |
| Hybrid BM25 retrieval | Cut | Always defer |
| Playwright E2E | Cut | Post-demo |

## Suggested use of remaining days

| Dates | Focus |
|-------|--------|
| **Jun 2–6** (calendar build) | Harden: import corpus, MCP in Cursor, optional Langfuse |
| **Jun 7–10** | Rehearsals only per [dry-run-checklist.md](./dry-run-checklist.md) |
| **Jun 11–13** | Backup video, deck polish, Q&A prep |
| **Jun 14** | Showcase |

## Do not add before Jun 10

- New agents or ERP integrations
- Payment execution
- Replacing golden eval with Kaggle test set

## Quick verify after stretch work

```bash
pnpm test && pnpm eval:tagging && pnpm build
pnpm demo
```
