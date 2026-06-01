# Dry-run checklist (Jun 9–13)

Use before each rehearsal. Target: **under 5 minutes** including one REFUSE mention.

## Environment

- [ ] `docker compose up -d` — Postgres healthy
- [ ] `pnpm db:seed` (if fresh DB)
- [ ] `.env` — `DATABASE_URL` correct; `LLM_ENABLE_LIVE_CALLS=false` OK for fast rehearsal
- [ ] `pnpm eval:tagging` — 100% pass, case-08 not `AUTO_TAG`

## Path A — CLI (fastest)

```bash
pnpm demo
```

- [ ] All **9 steps** print ✅
- [ ] Step 2: `FLAG_RECEIPT` + `QUEUE_REVIEW`
- [ ] Step 9: `REFUSE` on tenant-b
- [ ] Total time &lt; 2 min (fixture mode)

## Path B — UI (showcase)

```bash
pnpm demo && pnpm dev
```

- [ ] http://localhost:3000/review-queue — tenant **tenant-a**, filter **open**
- [ ] Open one item → **Why** panel shows `run_id`, `llm_skipped` or steps
- [ ] Override form applies GL (optional smoke)
- [ ] Switch tenant **tenant-b** — REFUSE item visible after demo step 9

## Path C — Backup recording (Jun 11–12)

- [ ] Record terminal: `pnpm demo` full output
- [ ] Record 30s UI: review queue + one transaction detail
- [ ] Store video path in personal notes (not committed)

## Slide sync

- [ ] Deck matches [showcase-deck.md](./showcase-deck.md) (5 slides + REFUSE backup)
- [ ] Eval table matches [eval-results.md](./eval-results.md)
- [ ] README author row filled before submission

## If something fails

| Failure | Fix |
|---------|-----|
| Demo duplicate / missing `policyOutcome` | Re-run `pnpm demo` (per-run external ids) |
| Eval case-05 fail after many demos | Harness clears Zephyr demo state automatically |
| Empty review queue | Run `pnpm demo` first |
| DB connection | Check port in `.env` vs `docker compose ps` |

**Dry-run log**

| Run | Date | Path | Time | Notes |
|-----|------|------|------|-------|
| #1 | | A / B | | |
| #2 | | | | |
| #3 | | | | |
