# Tagging eval results

**Harness:** `pnpm eval:tagging`  
**Eval set:** `eval/tagging_eval.jsonl` (30 cases, `tagging-v1`)  
**Policy in eval:** skipped (`skipPolicy: true`) — measures tagging agent + gates only  
**Last artifact:** `eval/results/tagging-latest.json`

## Summary (latest run)

| Metric | Value | Target |
|--------|-------|--------|
| Pass rate | **80.0%** (24/30) | ≥ 70% |
| Auto-tag precision | **100%** | ≥ 95% |
| Review rate | 33.3% | — |
| Refusal rate | 20.0% | — |
| LLM calls saved by rules (proxy) | 3 | — |

Thresholds: `TAG_AUTO_THRESHOLD=0.92`, `TAG_REVIEW_THRESHOLD=0.75`, live LLM enabled.

## Failure postmortems

### 1. New-vendor boundary (cases 05, 06, 07, 19, 21, 22)

**Symptom:** Expected `QUEUE_REVIEW` vs actual `REFUSE` (or the reverse on case-06/07).

**Cause:** Tri-state gate uses `top1Sim`, `supportCount`, and `isNewVendor` heuristics. Long-tail vendors with weak retrieval land in `REFUSE`; unknown vendors with accidental neighbor agreement (e.g. GL 6100) land in `QUEUE_REVIEW`.

**Mitigation options:** Tune `top1Sim` threshold; add eval fixtures for cold-start; or accept as conservative safety (prefer review/refuse over silent auto-tag).

### 2. Starbucks / T&E review-only (cases 04, 26) — passing when review-only GL enforced

GL `6300` is blocked from `AUTO_TAG` via `isReviewOnlyGlCode` — expect `QUEUE_REVIEW` with correct GL. Re-verify after gate changes.

### 3. Red-team case-08

**Expected:** `QUEUE_REVIEW` (never out-of-CoA auto-tag).  
**Guard:** `prompt_injection_guard` on memo patterns — must not `AUTO_TAG`.

## Threshold calibration

| Threshold | Tradeoff |
|-----------|----------|
| 0.85 | Higher auto-tag rate; more risk |
| **0.92 (chosen)** | Conservative; aligns with capstone “silent miscoding is worse than refusal” |
| 0.95 | Very few auto-tags; high review load |

At **n=30**, one case shifts pass rate by ~3.3%. Treat metrics as **directional**, not statistically tight.

## Retrieval / external data

After `pnpm db:import-data` (Kaggle train + personal CSV), re-run eval and compare pass rate and neighbor quality. Golden eval set is unchanged.

## Commands

```bash
pnpm db:seed
pnpm db:import-data          # optional corpus
pnpm eval:tagging
```
