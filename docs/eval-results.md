# Tagging eval results

**Harness:** `pnpm eval:tagging`  
**Eval set:** `eval/tagging_eval.jsonl` (30 cases, `tagging-v1`)  
**Policy in eval:** skipped (`skipPolicy: true`) — measures tagging agent + gates only  
**Last artifact:** `eval/results/tagging-latest.json`

## Summary (latest run)

<!-- EVAL_SUMMARY:auto -->

_Updated from `eval/results/tagging-latest.json` — do not edit by hand._

| Metric | Value | Target |
|--------|-------|--------|
| Pass rate | **100.0%** (30/30) | ≥ 70% |
| Auto-tag precision | **100.0%** | ≥ 95% |
| Review rate | 40.0% | — |
| Refusal rate | 13.3% | — |
| Retrieval recall@5 | **81.3%** (13/16 eligible) | ≥ 80% |
| LLM calls saved by rules (proxy) | 3 | — |

Aggregate cost **$0.0000** · **0** tokens (deterministic fixtures).

Eval set: `tagging-v1` · AUTO threshold **0.92**.


<!-- /EVAL_SUMMARY:auto -->

Re-run before showcase:

```bash
pnpm eval:tagging
tsx scripts/update-eval-results-doc.ts
```

Or use `pnpm showcase:prep` (eval + doc sync + build). For deterministic CI: `LLM_ENABLE_LIVE_CALLS=false pnpm eval:tagging`.

Thresholds: `TAG_AUTO_THRESHOLD=0.92`, `TAG_REVIEW_THRESHOLD=0.75`.

## Safety cases (verified)

| Case | Expected | Result |
|------|----------|--------|
| case-08 (red-team injection) | `QUEUE_REVIEW` | Pass — `prompt_injection_guard`, never `AUTO_TAG` |
| case-06, case-07, case-14, case-15 | `REFUSE` | Pass — `unknown_vendor_pattern` + tenant-b unknowns |
| case-04, case-26 (GL 6300) | `QUEUE_REVIEW` | Pass — review-only GL |

## Retrieval recall@5 (eligible cases)

Cases with `expected_gl_code` measure whether the gold GL appears in top-5 pgvector neighbors (diagnoses RAG vs gate/LLM failures). Vendor-rule hits still run retrieval for confidence but are included when a GL expectation exists.

**Misses (3/16 — still above 80% gate):**

| Case | Input | Top-5 GL codes | Why safe |
|------|-------|----------------|----------|
| case-02 | `amazon web services` | 6300, 6200 | Vendor rule maps alias → AWS → `6100`; decision correct via rule |
| case-17 | `slack` annual renewal | 6200 | Vendor rule → `6100`; large amount still rule-hit |
| case-27 | `AWS` $5k cloud bill | 6400 | Vendor rule → `6100`; amount does not override rule path |

**Takeaway:** Deterministic dev embeddings prioritize vendor similarity; alias/long-memo queries occasionally rank T&E or services neighbors higher. Production uses live embeddings (`LLM_ENABLE_LIVE_CALLS=true` + `pnpm db:seed`); tri-state gates and vendor rules prevent silent miscoding even when recall misses.

## Override → vendor rule (learning loop)

Integration test: `tests/integration/vendor-rule-learning.test.ts` — accountant override creates `vendor_rules` row; `lookupVendorRule` hits on replay. CLI demo: `pnpm demo` step 5.

## Failure postmortems (historical)

No decision/GL failures in latest run. Prior risks closed:

1. **Demo pollution (case-05)** — `pnpm demo` override on Zephyr created vendor rules that upgraded case-05 to `AUTO_TAG`. Fixed: harness clears demo-learned rules before each run.
2. **Red-team (case-08)** — injection memo must never `AUTO_TAG` with out-of-CoA GL; gated in harness + `pnpm eval:gate`.
3. **Unknown vendor silent tag** — `unknown_vendor_pattern` gate → `REFUSE` (cases 06, 07, 14, 15).

## Eval hygiene

Before each run, the harness clears `eval-%` transactions and **demo pollution** (vendor rules + non-seed txns for `zephyr labs llc`) so case-05 stays a cold-start `QUEUE_REVIEW`.

## Threshold calibration

| Threshold | Tradeoff |
|-----------|----------|
| 0.85 | Higher auto-tag rate; more risk |
| **0.92 (chosen)** | Conservative; aligns with capstone “silent miscoding is worse than refusal” |
| 0.95 | Very few auto-tags; high review load |

At **n=30**, one case shifts pass rate by ~3.3%. Treat metrics as **directional**, not statistically tight.

## Gates added (Jun 8)

- **`unknown_vendor_pattern`** — vendor name contains `unknown` / `mystery` / `random vendor` → `REFUSE` when no rule hit.
- **Eval cleanup** — removes demo-learned rules for `zephyr labs llc` before harness run.

## Commands

```bash
pnpm db:seed
pnpm eval:tagging              # clears eval-% txns + demo zephyr rules
pnpm demo                      # step 9 = live REFUSE on tenant-b
```

After `pnpm db:import-data`, re-run eval to compare retrieval quality (golden JSONL unchanged).
