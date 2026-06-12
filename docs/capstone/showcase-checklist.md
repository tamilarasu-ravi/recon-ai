# Showcase checklist

Use before a live demo or release sign-off. Target: **3–5 minute** live path with backup video.

---

## T-24h — Automated gate

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm showcase:prep    # typecheck + test + eval + build + refresh eval-results.md
pnpm demo             # full CLI E2E (9 steps)
```

All green? Proceed. If eval fails, fix tagging/gates before UI polish.

---

## T-1h — Environment

| Check | Command / action |
|-------|------------------|
| Postgres + pgvector up | `docker compose ps` |
| Seed data fresh | `pnpm db:seed` |
| API key (optional live LLM) | `.env` — `GOOGLE_API_KEY` or `OPENAI_API_KEY`, `LLM_ENABLE_LIVE_CALLS` |
| Dev server | `pnpm dev` → http://localhost:3000 |
| Backup video recorded | Screen capture of `pnpm demo` + 60s UI walkthrough |

---

## Live demo path (UI — Option B)

Script: [`docs/demo-script.md`](../demo-script.md)

| # | Story beat | Where | What to show |
|---|------------|-------|----------------|
| 1 | Platform hub | `/` | Tenant metrics, module cards |
| 2 | AUTO_TAG + rule | Review queue → **Slack** (tenant-a) | Decision badge, **Label memory (RAG)** neighbors |
| 3 | Receipt gate | **AWS** txn | `QUEUE_REVIEW` until receipt; upload → reprocess |
| 4 | Learning loop | **Option D** in [`demo-script.md`](../demo-script.md#option-d--vendor-rule-learning-ui--skill-reuse) — Zephyr override → GL 6200 → replay → AUTO_TAG |
| 5 | REFUSE | tenant-b · **Unknown Courier 42** | `REFUSE` — never silent wrong GL |
| 6 | Orchestrator | `/orchestrator` | LangGraph topology |
| 7 | AP | `/ap` → Staples invoice | Recommendation + duplicate on replay |
| 8 | Audit | Transaction detail · **Run trace** | `run_id`, graph steps, token/cost if live |
| 8b | Agentic evidence (preview) | Reprocess **AWS** with flag on | Live trace: **Evidence plan** → skipped RAG → verifier |
| 9 | Agent-native | (optional) `pnpm mcp` | `ingest_transaction`, `get_review_queue` |

**Tenant switch:** changing tenant on a txn detail URL redirects to queue — by design.

---

## Must-mention talking points

1. **Orchestrator owns state** — agents return structured payloads only.
2. **Tri-state autonomy** — `AUTO_TAG` / `QUEUE_REVIEW` / `REFUSE` with deterministic confidence.
3. **Rule-first** — vendor rules skip LLM; overrides create rules.
4. **RAG** — pgvector neighbors in prompt + UI panel (not a black box).
5. **Eval-gated** — `pnpm eval:tagging` 30 cases, red-team case-08 safe.
6. **Agentic evidence (develop)** — planner selects tools; known-vendor rules skip retrieval; gates unchanged.

---

## Backup if API fails

1. Play recorded video (2 min).
2. Walk `eval/results/tagging-latest.json` + [`docs/eval-results.md`](../eval-results.md).
3. Show `pnpm demo` terminal output (pre-captured).

---

## Post-demo Q&A cheatsheet

| Question | Answer pointer |
|----------|----------------|
| Why not fine-tune? | Per-vendor rules + retrieval corpus; auditable, no training pipeline |
| Wrong GL risk? | CoA allow-list + REFUSE + HITL on receipt / weak retrieval |
| Scale? | `docs/production-at-scale.md` — pgvector until recall gap |
| ERP? | Mock adapter today; OAuth design in `docs/architecture.md` |

---

## Release rules

- Re-run `pnpm showcase:prep` before any tagging/threshold change ships.
- Update `docs/eval-results.md` when metrics move.
