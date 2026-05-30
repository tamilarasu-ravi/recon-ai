# Planning phase status — capstone POC planner

**Last updated:** 2026-05-30  
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
| 6 | Eval plan | **Partial (plan only)** | [README eval plan](../../README.md#eval-plan) · harness **not built** |
| 7 | Generate spec | **Partial** | README + tech-stack + schedule + [hero build spec](../superpowers/specs/2026-05-28-tagging-mini-product-design.md) |

**Overall:** Planning sufficient to **start scaffold (May 28)**. Close Phase 1 + 6 gaps during Phase A build. Phase 2 optional unless competitive claims go in the deck.

---

## Phase gates (mandatory checks)

| Gate | When | Required phases | Status |
|------|------|-----------------|--------|
| **Pre-scaffold** | Before first `src/` commit | 0, 1, 5, 6 | **Ready with notes** — see Phase 1 and 6 below |
| **Pre-freeze** | Jun 9–10 | Re-read Phase 6 | **Not started** — need live harness + 30 JSONL cases |
| **Scope change** | Any time | Re-read Phase 1 | N/A |

---

## Phase 0 — Capture idea

**File:** [`phases/00-capture-idea.md`](../../capstone-poc-planner/phases/00-capture-idea.md)  
**Status:** **Done**

### Output contract checklist

- [x] 2–4 sentence project description
- [x] Specific user segment (mid-market finance / CFO ops — not “businesses”)
- [x] Clear user outcome (confidence-gated GL coding, policy gate, audit, learn from overrides)

### Artifacts

| Artifact | Location |
|----------|----------|
| Thesis + positioning | [README](../../README.md) (opening) |
| Pitch narrative | [docs/PITCH-cfo-operations-platform.md](../PITCH-cfo-operations-platform.md) |
| PDF pitch | [PITCH-cfo-operations-platform.pdf](../../PITCH-cfo-operations-platform.pdf) |

### Notes

Problem statement is concrete: three workflows (tagging, policy, AP) on one platform; hero depth on Workflow 1.

---

## Phase 1 — Idea interrogation

**File:** [`phases/01-idea-interrogation.md`](../../capstone-poc-planner/phases/01-idea-interrogation.md)  
**Status:** **Partial**

### Output contract checklist

- [ ] All five interrogation questions documented with substantive answers
- [ ] Explicit verdict **(a) / (b) / (c)** on record
- [x] Project type identified: **hybrid RAG + agentic (orchestrator)** — retrieval + rule-first + thin multi-agent platform (not LangGraph-style)

### Implicit verdict (from README scope)

**(a) Worth pursuing** — one platform + hero tagging (~70%) + policy/AP stubs; tri-state autonomy; eval-first. Biggest risk: scope creep into three production agents; mitigated by Jun 10 tier and cut order.

### Five questions — current coverage

| # | Question | Covered in | Gap |
|---|----------|------------|-----|
| 1 | Problem / user / today’s workaround | README unified capstone, pitch | Not in Q&A form |
| 2 | Wedge vs existing | README positioning (“not LLM finance assistant”) | No named competitors |
| 3 | Why now | Implicit (structured outputs, embeddings, tool use) | Not written as paragraph |
| 4 | Honest scope (agent vs prompt) | README orchestrator vs agents, explicit non-choices | Strong |
| 5 | What gets worse with AI | README REFUSE, red-team, silent miscoding | Strong |

### Recommended fix (optional, ~30 min)

Add [`phase-1-verdict.md`](./phase-1-verdict.md) with formal verdict + one paragraph per question. **Not blocking scaffold.**

---

## Phase 2 — Research

**File:** [`phases/02-research.md`](../../capstone-poc-planner/phases/02-research.md)  
**Status:** **Skipped / partial**

### Output contract checklist

- [ ] Approval block: 3 existing solutions, 1 SOTA reference, pricing, 1 paper (if applicable)
- [ ] Student “proceed” on sources
- [ ] Sources saved for spec §13

### Artifacts

None dedicated. Course brief + README workflow tables substitute for capstone scope.

### Notes

`cfo-capstone.mdc` marks Phase 2 as **optional** unless competitive claims appear in the deck. If you add “vs Ramp / Expensify / etc.” slides, create [`docs/research.md`](../research.md) with primary sources before Jun 9 deck final.

---

## Phase 3 — PMF analysis

**File:** [`phases/03-pmf-analysis.md`](../../capstone-poc-planner/phases/03-pmf-analysis.md)  
**Status:** **Partial**

### Output contract checklist

- [x] User segment + problem (README workflow pain table)
- [x] Competitive picture (high level — unified platform vs siloed tools)
- [ ] Explicit honesty markers (“evidence is thin”, capability trajectory risks)
- [ ] Formal decision: keep / adjust / pivot

### Artifacts

| Artifact | Location |
|----------|----------|
| Workflow pain + “good looks like” | [README § unified capstone](../../README.md#unified-capstone-three-workflows-one-platform) |
| PMF-style summary table | [Pitch § Summary](../PITCH-cfo-operations-platform.md) |

### Notes

Sufficient for build and interview narrative. Optional: 1-page PMF addendum in `docs/planning/` if deck reviewers want explicit PMF section.

---

## Phase 4 — Resource estimation

**File:** [`phases/04-resource-estimation.md`](../../capstone-poc-planner/phases/04-resource-estimation.md)  
**Status:** **Done**

### Output contract checklist

- [x] Time estimate by phase (low/high implicit in day-by-day schedule)
- [x] Compute: laptop + Docker Postgres; no GPU training
- [x] API cost: dev + demo (~&lt;$5) in tech-stack
- [x] Data: 50–100 synthetic txns, 30 eval cases, mock invoices
- [x] External services: OpenAI/Anthropic, optional Vercel/Neon — free tier noted
- [x] Feasibility + cut order documented

### Artifacts

| Artifact | Location |
|----------|----------|
| Day-by-day plan | [docs/schedule.md](../schedule.md) |
| Cost estimate | [docs/tech-stack.md §10](../tech-stack.md#10-cost-estimate-poc-scale) |
| Cut order | [README § if you slip](../../README.md#if-you-slip--cut-order) |

---

## Phase 5 — Tech stack

**File:** [`phases/05-tech-stack.md`](../../capstone-poc-planner/phases/05-tech-stack.md)  
**Status:** **Done**

### Output contract checklist

- [x] Preferences captured (TypeScript, Next.js, Drizzle, pgvector, OpenAI primary)
- [x] Final stack with reasoning per choice
- [x] Documented for build

### Artifacts

| Artifact | Location |
|----------|----------|
| Locked stack | [docs/tech-stack.md](../tech-stack.md) |
| README summary | [README § tech stack](../../README.md#tech-stack-recommended) |
| Env template | [`.env.example`](../../.env.example) _(create at scaffold)_ |

---

## Phase 6 — Eval plan

**File:** [`phases/06-eval-plan.md`](../../capstone-poc-planner/phases/06-eval-plan.md)  
**Status:** **Partial — plan done, implementation pending**

### Output contract checklist

- [x] 5–10+ eval cases with input, expected behavior, failure mode ([README table](../../README.md#example-eval-cases-minimum-8-in-harness-expand-to-30-rows-in-jsonl))
- [x] Metrics + target thresholds (precision ≥95%, recall@5 ≥80%, etc.)
- [x] Red-team case specified (prompt injection → never wrong GL)
- [ ] LLM-as-judge plan — **N/A for GL** (exact match); optional for AP rationale only
- [ ] **Harness built** — `pnpm eval:tagging` does not exist yet
- [ ] **`eval/tagging_eval.jsonl`** — not committed yet

### Artifacts

| Artifact | Location | Status |
|----------|----------|--------|
| Eval plan (metrics + cases) | [README § eval plan](../../README.md#eval-plan) | Done |
| Production AI eval extensions | [Hero spec §8, §12.5](../superpowers/specs/2026-05-28-tagging-mini-product-design.md) | Spec only |
| JSONL dataset | `eval/tagging_eval.jsonl` | **Missing** |
| Harness script | `scripts/run-tagging-eval.ts` | **Missing** |
| Results | `docs/eval-results.md` | **Missing** |

### Build checkpoint

**Jun 3 (hard):** `pnpm eval:tagging` runs; 30 cases committed; red-team case passes.

---

## Phase 7 — Generate POC spec

**File:** [`phases/07-generate-spec.md`](../../capstone-poc-planner/phases/07-generate-spec.md)  
**Status:** **Partial — distributed spec (accepted substitute)**

Phase 7 expects a single `<project-slug>-poc-spec.md` with 14 sections. This project uses a **consolidated multi-doc spec** per `cfo-capstone.mdc`:

| Spec § (Phase 7 template) | Satisfied by |
|---------------------------|--------------|
| 1–2 Summary, problem, user | README + Pitch |
| 3 Why now | README (implicit) · optional phase-1 doc |
| 4 Competitive landscape | Pitch · Phase 2 gap |
| 5 Capability trajectory | README production next |
| 6 POC scope | README scope + non-goals |
| 7 Tech stack | docs/tech-stack.md |
| 8 Architecture | README architecture · `docs/architecture.md` **(Jun 6)** |
| 9 Eval plan | README + hero spec §8 |
| 10–14 (data, risks, sources, …) | README + schedule + hero spec |

### Artifacts

| Artifact | Location | Status |
|----------|----------|--------|
| Consolidated charter | [README.md](../../README.md) | Done |
| Hero implementation spec | [2026-05-28-tagging-mini-product-design.md](../superpowers/specs/2026-05-28-tagging-mini-product-design.md) | Done |
| Single POC-SPEC.md | `docs/POC-SPEC.md` | **Not created** (optional) |
| Architecture doc | `docs/architecture.md` | **Due Jun 6** |
| Demo script | `docs/demo-script.md` | **Due Jun 9** |

### Optional consolidation

If you want one file for graders or LinkedIn: generate `docs/POC-SPEC.md` by merging README sections + tech-stack + hero spec §12 summary. **Not required to start build.**

---

## Implementation status (cross-cutting)

| Item | Status |
|------|--------|
| `src/` scaffold | **Not started** |
| Docker + migrations | **Not started** |
| `eval/tagging_eval.jsonl` | **Not started** |
| `pnpm eval:tagging` | **Not started** |
| Review queue UI | **Not started** |

---

## Next actions (priority order)

1. **May 28** — Scaffold Next.js + Drizzle + Docker; schema includes `tenant_id` indexes, `processing_status`, idempotency (§12.9).
2. **May 28–29** — P0 from hero spec §12: step spans, cost fields, prompt versioning in LLM client; 429 backoff + `llm_unavailable` → review.
3. **Jun 1–2** — Rule-first LLM skip + `llm_skipped_reason`; tenant-scoped retrieval.
4. **Jun 3** — Close Phase 6: JSONL + `pnpm eval:tagging` + red-team pass + `llm_calls_saved_by_rules`.
5. **Jun 6** — `docs/architecture.md` v1 (implement-now vs defer paragraph).
6. **Optional** — `docs/planning/phase-1-verdict.md` + `docs/research.md` if deck needs formal PMF/competitive citations.

---

## Quick reference — doc hierarchy

```text
phases/*.md                          ← checklist (this file tracks status)
README.md                            ← project charter (primary)
docs/superpowers/specs/...design.md  ← hero build + §12 production AI
docs/schedule.md                     ← when
docs/tech-stack.md                   ← stack
docs/planning/phase-status.md        ← you are here
```

---

_Linked from [README § related planning artifacts](../../README.md#related-planning-artifacts) · Planning map in [cfo-capstone.mdc §10](../../.cursor/rules/cfo-capstone.mdc)_
