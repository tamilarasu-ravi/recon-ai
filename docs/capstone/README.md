# Capstone & demo artifacts

Academic origin and demo prep. **Product direction:** [STRATEGY.md](../../STRATEGY.md) · [product-roadmap.md](../product-roadmap.md).

## Demo & verification

| Doc | Purpose |
|-----|---------|
| [showcase-checklist.md](./showcase-checklist.md) | Pre-demo gate (`pnpm showcase:prep`, UI path, Q&A) |
| [demo-script.md](../demo-script.md) | CLI / API / UI demo options |

## Requirements & evals

| Doc | Purpose |
|-----|---------|
| [capstone-requirements-and-evals.md](../capstone-requirements-and-evals.md) | Original rubric (problem, data, eval criteria) |
| [eval-results.md](../eval-results.md) | Latest metric tables |
| [../../eval/results/](../../eval/results/) | Eval JSON artifacts |

## Planning reference

| Path | Purpose |
|------|---------|
| [../../capstone-poc-planner/](../../capstone-poc-planner/) | Ideation phases 0–7 (historical) |

## Quick verify

```bash
docker compose up -d
pnpm db:seed
pnpm showcase:prep
pnpm demo
pnpm eval:tagging
```
