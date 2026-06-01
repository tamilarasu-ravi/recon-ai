# Code freeze — v0.1.0-demo (Jun 10, 2026)

**Gate G4:** No new features after this date. Buffer Jun 11–13 = rehearsal and P0 fixes only.

## Verification (automated)

| Command | Status | Notes |
|---------|--------|-------|
| `pnpm test` | Pass | 13 unit tests |
| `pnpm typecheck` | Pass | strict TS |
| `pnpm eval:tagging` | Pass | 30/30, 100% auto-tag precision |
| `pnpm build` | Pass | Next.js 15 production build |
| `pnpm demo` | Run locally | 9-step E2E incl. REFUSE |

Last eval artifact: `eval/results/tagging-latest.json`  
Eval mode for freeze sign-off: `LLM_ENABLE_LIVE_CALLS=false` (deterministic). Re-run with live API before showcase if desired.

## Human checklist (before tag)

- [ ] README author name + email filled ([README](../README.md) header table)
- [ ] Dry-run #2 completed — [dry-run-checklist.md](./dry-run-checklist.md)
- [ ] All intended changes committed (exclude `tsconfig.tsbuildinfo`, `.env`)
- [ ] Git tag: `git tag -a v0.1.0-demo -m "Capstone demo freeze Jun 10 2026"`

## Scope delivered (P0)

| Area | Evidence |
|------|----------|
| Orchestrator + audit | `src/lib/orchestrator/`, `events`, `audit_log` |
| Tagging hero | rule-first, RAG, tri-state, `pnpm eval:tagging` |
| Policy gate | receipt blocks AUTO_TAG, `policy_version` |
| AP stub | recommend-only + duplicate refuse |
| HITL UI | `/review-queue`, `/transactions/[id]` |
| Docs | `architecture.md`, `eval-results.md`, `demo-script.md`, `showcase-deck.md` |

## Explicitly deferred (post-demo)

Langfuse, MCP, Vercel deploy, full Kaggle corpus import, receipt UI upload, Playwright E2E.

## Showcase (Jun 14)

Slides: [showcase-deck.md](./showcase-deck.md) · Demo: `pnpm demo` or UI path in [demo-script.md](./demo-script.md).
