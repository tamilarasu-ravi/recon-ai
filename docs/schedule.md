# Capstone schedule — demo June 14, 2026

| Milestone | Date | Notes |
|-----------|------|--------|
| **Planning locked** | May 27, 2026 | README + tech-stack + rules (today) |
| **Build starts** | May 28 | Scaffold + DB |
| **Tagging eval v1** | Jun 3 | `pnpm eval:tagging` must run |
| **Feature complete** | Jun 6 | E2E demo path works (CLI OK) |
| **Code freeze** | **Jun 10** | No new features; evals green; deck draft done |
| **Buffer** | Jun 11–13 | Rehearse 3-min demo; P0 fixes only |
| **Showcase** | **Jun 14** | Demo day |

**Working days (build):** May 28 → Jun 10 ≈ **10 weekdays** + weekends as needed (~14 calendar days).

---

## What ships by June 10 (realistic scope)

Target the **3-week tier**, compressed — not the 4–6 week stretch.

| Must ship | Defer past Jun 10 |
|-----------|-------------------|
| Orchestrator + events + audit + review queue | Langfuse |
| Tagging hero + tri-state + vendor rules | MCP server |
| Policy gate + receipt blocks `AUTO_TAG` | Playwright E2E |
| AP recommend-only + duplicate check | Vercel deploy (optional for showcase if local demo OK) |
| `eval/tagging_eval.jsonl` + results table | Hybrid BM25 / rerank |
| `docs/architecture.md` + `docs/demo-script.md` | 100+ txn scale test |
| One `REFUSE` + one override→rule in demo | Employee Slack/email integration |

---

## Day-by-day (May 27 – Jun 10)

### Phase A — Foundation (May 28 – Jun 1)

| Date | Deliverable |
|------|-------------|
| **May 28 (Thu)** | `create-next-app`, Docker Postgres/pgvector, Drizzle schema: `tenants`, `chart_of_accounts`, `events`, `audit_log`; **`tenant_id` indexes, `processing_status`, idempotency** (§12.9) |
| **May 29 (Fri)** | `review_queue`, seed script (2 tenants, CoA), orchestrator skeleton |
| **May 31 (Sat)** | OpenAI client (cost, prompt version, **429 backoff**, outage → review), Zod tagging schema, vendor normalize stub |
| **Jun 1 (Sun)** | Rule store + **rule-first LLM skip**; pgvector table + embed on ingest (tenant-scoped) |

### Phase B — Hero + gates (Jun 2 – Jun 6)

| Date | Deliverable |
|------|-------------|
| **Jun 2 (Mon)** | Retrieval top-k + confidence scorer + tri-state gate |
| **Jun 3 (Tue)** | `pnpm eval:tagging` + 30-case JSONL; calibration bins + **`llm_calls_saved_by_rules`**; fix until precision path clear |
| **Jun 4 (Wed)** | Policy TS evaluator + `policy_version` on events; receipt flag |
| **Jun 5 (Thu)** | Receipt gate blocks `AUTO_TAG`; AP module + mock invoices |
| **Jun 6 (Fri)** | **E2E:** card txn → policy → receipt → tag → invoice → AP; `docs/architecture.md` v1 (**implement now vs defer** paragraph) |

### Phase C — Polish & freeze (Jun 7 – Jun 10)

| Date | Deliverable |
|------|-------------|
| **Jun 7 (Sat)** | Review queue UI (minimal) or polished CLI; override → vendor rule demo |
| **Jun 8 (Sun)** | `docs/eval-results.md`; tune thresholds; `REFUSE` + red-team case verified |
| **Jun 9 (Mon)** | `docs/demo-script.md` (3 min); slide deck draft; dry-run #1 |
| **Jun 10 (Tue)** | **CODE FREEZE** — dry-run #2; README author info; tag release `v0.1.0-demo` |

### Buffer (Jun 11 – Jun 13) — no feature work

| Date | Activity |
|------|----------|
| **Jun 11** | Dry-run #3; backup recorded demo video |
| **Jun 12** | Deck final; postmortem notes for Q&A |
| **Jun 13** | Rest + P0 only; print checklist |

### Jun 14 — Showcase

- Live demo: scripted path only (no improv)
- Backup: 2-min video if API fails
- Slide: architecture + eval table + one `REFUSE` example

---

## If behind (cut order with dates)

| If slipping on… | Cut | Still hit by |
|-----------------|-----|--------------|
| Jun 4 | Policy → single receipt-required rule only | Jun 6 |
| Jun 5 | AP → duplicate check only (no forecast buckets) | Jun 6 |
| Jun 7 | UI → CLI-only demo | Jun 10 |
| Jun 8 | Skip Langfuse/MCP entirely | Jun 10 |
| Jun 9 | Deck → 5 slides + README link | Jun 10 |

**Never slip past Jun 10 without:** tagging + eval table + `REFUSE` + audit + rehearsed path.

---

## Daily habit (10 min)

- Run `pnpm eval:tagging` after any tagging/confidence change
- Update `docs/eval-results.md` when metrics move
- One git commit per logical slice

---

**Planning validation:** [`capstone-poc-planner/phases/`](../capstone-poc-planner/phases/) (see [`.cursor/rules/cfo-capstone.mdc`](../.cursor/rules/cfo-capstone.mdc) §10). Phase **4** (resources) ↔ this schedule · Phase **6** (evals) ↔ Jun 3 checkpoint · **Scale hooks:** [production-at-scale.md § Implement now](./production-at-scale.md#implement-now-vs-defer-capstone-build) · [hero spec §12.9](./superpowers/specs/2026-05-28-tagging-mini-product-design.md#129-scale-ready-hooks-implement-now-not-later)

_Linked from [README](../README.md#timeline-demo-june-14-2026) · [tech-stack.md](./tech-stack.md#8-rollout-calendar-may-27--june-14-2026)_
