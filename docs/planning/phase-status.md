# Planning phase status — capstone POC planner

**Last updated:** 2026-06-09  
**Orchestrator:** [`capstone-poc-planner/SKILL.md`](../../capstone-poc-planner/SKILL.md)  
**How we use phases:** Checklists and gates — not a full re-run of the interactive planner. Artifacts live in README + `docs/`; see [`cfo-capstone.mdc`](../../.cursor/rules/cfo-capstone.mdc) §10.

**Build window:** May 28 – Jun 10 (code freeze) · **Showcase:** Jun 14, 2026

---

## Summary

| Phase | Name | Status | Primary artifact |
|-------|------|--------|------------------|
| 0 | Capture idea | **Done** | [README § thesis](../../README.md) · [Pitch](../PITCH-cfo-operations-platform.md) |
| 1 | Idea interrogation | **Partial** | README scope (implicit verdict) |
| 2 | Research | **Skipped / partial** | — (no `docs/research.md` yet) |
| 3 | PMF analysis | **Partial** | README workflows · Pitch |
| 4 | Resource estimation | **Done** | [schedule.md](../schedule.md) · [tech-stack §10](../tech-stack.md#10-cost-estimate-poc-scale) |
| 5 | Tech stack | **Done** | [tech-stack.md](../tech-stack.md) |
| 6 | Eval plan | **Done** | [capstone-requirements-and-evals.md](../capstone-requirements-and-evals.md) · harness green |
| 7 | Generate spec | **Partial** | README + tech-stack + schedule + [architecture.md](../architecture.md) |

**Overall:** Build + eval deliverables **complete for showcase**. Optional doc gaps: formal Phase 1 verdict, `docs/research.md`, single `POC-SPEC.md`.

---

## Phase gates (mandatory checks)

| Gate | When | Required phases | Status |
|------|------|-----------------|--------|
| **Pre-scaffold** | Before first `src/` commit | 0, 1, 5, 6 | **Done** |
| **Pre-freeze** | Jun 9–10 | Re-read Phase 6 | **Done** — 30 JSONL cases, `pnpm eval:tagging` + `pnpm eval:gate` green |
| **Scope change** | Any time | Re-read Phase 1 | N/A |

---

## Phase 6 — Eval plan

**File:** [`phases/06-eval-plan.md`](../../capstone-poc-planner/phases/06-eval-plan.md)  
**Status:** **Done**

### Output contract checklist

- [x] 30 eval cases with input, expected behavior, and `failure_mode` ([`eval/tagging_eval.jsonl`](../../eval/tagging_eval.jsonl))
- [x] Metrics + thresholds: auto precision ≥95%, retrieval recall@5 ≥80%, pass rate ≥70%
- [x] Red-team case (case-08) — enforced in harness + CI gate
- [x] LLM-as-judge — **N/A for GL** (exact match); documented in README
- [x] Harness: `pnpm eval:tagging`, `pnpm eval:gate`, CI workflow
- [x] Results: [`docs/eval-results.md`](../eval-results.md), [`eval/results/tagging-latest.json`](../../eval/results/tagging-latest.json)

### Latest metrics (deterministic CI)

| Metric | Value | Target |
|--------|-------|--------|
| Pass rate | 100% (30/30) | ≥ 70% |
| Auto-tag precision | 100% | ≥ 95% |
| Retrieval recall@5 | 81.3% (13/16) | ≥ 80% |
| Red-team case-08 | `QUEUE_REVIEW` | never `AUTO_TAG` |

### Artifacts

| Artifact | Location |
|----------|----------|
| Eval set | `eval/tagging_eval.jsonl` |
| Harness | `scripts/run-tagging-eval.ts` |
| Regression gate | `scripts/eval-gate.ts` + `eval/baseline/tagging-baseline.json` |
| Requirements | `docs/capstone-requirements-and-evals.md` |
| Learning loop test | `tests/integration/vendor-rule-learning.test.ts` |

---

## Implementation status (cross-cutting)

| Item | Status |
|------|--------|
| `src/` scaffold | **Done** |
| Docker + migrations | **Done** |
| `eval/tagging_eval.jsonl` (30 cases) | **Done** |
| `pnpm eval:tagging` + `pnpm eval:gate` | **Done** — CI green |
| Review queue UI | **Done** |
| `docs/architecture.md` + demo script | **Done** |

---

## Optional follow-ups (post-showcase)

1. `docs/planning/phase-1-verdict.md` — formal interrogation Q&A if grader requires it
2. `docs/research.md` — competitive landscape if deck cites Ramp/Expensify
3. Live LLM eval run: `LLM_ENABLE_LIVE_CALLS=true pnpm eval:tagging` → refresh `docs/eval-results.md`

---

_Linked from [README § related planning artifacts](../../README.md#related-planning-artifacts) · Planning map in [cfo-capstone.mdc §10](../../.cursor/rules/cfo-capstone.mdc)_
