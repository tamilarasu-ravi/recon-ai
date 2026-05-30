# Tech Stack Planning — CFO Capstone Platform

**Status:** Recommended (locked for implementation)  
**Code freeze:** **June 10, 2026** · **Demo:** **June 14, 2026** · **Build window:** May 28 – Jun 10 (~14 days)  
**Schedule:** [`schedule.md`](./schedule.md) · **README:** [timeline](../README.md#timeline-demo-june-14-2026)  
**Companion docs:** [`README.md`](../README.md) · [`schedule.md`](./schedule.md) · [`.cursor/rules/cfo-capstone.mdc`](../.cursor/rules/cfo-capstone.mdc) · [`ARCHITECTURE.md`](./architecture.md) _(by Jun 6)_  
**Planning phases:** Phase **5** ↔ this doc · [`capstone-poc-planner/phases/05-tech-stack.md`](../capstone-poc-planner/phases/05-tech-stack.md) · full map in `cfo-capstone.mdc` §10

---

## 1. Planning principles

| Principle | Implication |
|-----------|-------------|
| **One repo, one language** | TypeScript end-to-end (API, orchestrator, eval CLI) |
| **Boring > clever** | Custom orchestrator, no LangGraph/CrewAI for a linear pipeline |
| **Postgres is the system of record** | Events, audit, tenants, rules, vectors in one DB |
| **LLM for judgment, code for truth** | GL allow-list, confidence, policy eval, AP math = deterministic |
| **Eval-driven** | Stack must support `pnpm eval:tagging` from week 1; CI-style replay by week 4+ |
| **Portable demo** | Docker Compose locally; Vercel + Neon in week 5–6 (standard/stretch) |
| **Phased delivery** | May 28–Jun 6 = core stack; Jun 7–10 = polish/freeze; Jun 11–13 = buffer only |

**Reference implementation:** [`auto-tagging-agent`](../../tech-interview/auto-tagging-agent) (Python/FastAPI) — reuse **patterns** (rule-first, confidence router, golden evals), not the runtime.

### Idea-to-Plan pitch (planning only)

**Project pitch:** [`PITCH-cfo-operations-platform.pdf`](../PITCH-cfo-operations-platform.pdf) (regenerate: `.venv-pdf/bin/python scripts/generate-pitch-pdf.py`).

[`PITCH-idea-to-plan-reference.pdf`](../PITCH-idea-to-plan-reference.pdf) is a **reference layout** for a meta planning product — not the CFO runtime. Structured planning before coding:

| Pitch concept | Capstone application |
|---------------|----------------------|
| Structured output vs chat | `events`, `audit_log`, eval JSON — not ad-hoc prompts |
| Parallel review angles | Week 4+ eval dimensions (tagging, policy FP, AP sanity) |
| Human checkpoint | Review queue + accountant override |
| Task DAG | README week-by-week plan; optional GitHub Project |
| Full audit trail | `run_id`, Langfuse (week 4+), git history |

Traditional planning **3–6 weeks** in the pitch = serial PM/design handoffs. Your **course** 3–6 weeks = **build time** after this spec is locked.

---

## 2. Recommended stack (locked)

```text
┌─────────────────────────────────────────────────────────────┐
│  Browser (optional week 2)                                    │
│  Next.js 15 App Router — review queue, txn detail, audit    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Application layer (Node 20+, TypeScript 5.x)                 │
│  • API routes / Server Actions                                │
│  • Orchestrator (state machine)                               │
│  • Agents: policy · tagging · AP (pure functions + I/O)       │
│  • Zod schemas · LLM client · confidence scorer               │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ PostgreSQL 16 │   │ OpenAI or     │   │ Langfuse      │
│ + pgvector    │   │ Anthropic API │   │ (optional)    │
│ Drizzle ORM   │   │ embeddings    │   │ structured    │
└───────────────┘   └───────────────┘   │ logs          │
                                        └───────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Week 2 (thin): MCP server → wraps same REST/tools as UI    │
└─────────────────────────────────────────────────────────────┘
```

### Decision table

| Dimension | Choice | Rationale |
|-----------|--------|-----------|
| **Runtime** | Node.js **20 LTS** | Matches Next.js; single toolchain for app + scripts |
| **Language** | **TypeScript** strict | Aligns with cursor rules; Zod + Drizzle types |
| **Framework** | **Next.js 15** (App Router) | API + minimal UI in one deployable unit |
| **Database** | **PostgreSQL 16** | Relational finance domain; events + audit fit SQL |
| **ORM** | **Drizzle ORM** | Lightweight migrations; good pgvector story; less magic than Prisma for capstone |
| **Vectors** | **pgvector** extension | 50–100 txns — no Pinecone/Qdrant ops overhead |
| **LLM provider** | **OpenAI** primary (`gpt-4o-mini`) | Structured JSON + embeddings in one vendor; swap via env |
| **LLM fallback** | **Anthropic** (`claude-sonnet-4-*` or haiku) | Optional `LLM_PROVIDER=anthropic` for demo redundancy |
| **Embeddings** | `text-embedding-3-small` (1536-d) | Same provider as GPT; sufficient for short txn memos |
| **Orchestration** | **Custom** `src/lib/orchestrator/` | Linear policy → tagging → AP; gates in code |
| **Validation** | **Zod** | All LLM JSON boundaries |
| **Policy engine** | **TypeScript** rule evaluator | Compiled JSON rules in DB; 1 NL compile call offline |
| **UI** | Next.js + **Tailwind** + shadcn (minimal) | Review queue table + txn detail; CLI fallback OK |
| **CLI / seeds** | **tsx** + `scripts/` | Seed tenants, run evals, demo script |
| **Testing** | **Vitest** + **Playwright** (optional E2E) | Fast unit tests; one smoke E2E for demo path |
| **Lint/format** | **ESLint** + **Prettier** | Standard Next template |
| **Observability** | Structured JSON → `audit_log` + **Langfuse** optional | `run_id` correlation per README |
| **Local infra** | **Docker Compose** | `postgres:16` + pgvector image |
| **Deploy (optional)** | **Vercel** + **Neon** Postgres | Week 5–6 (standard/stretch); local demo OK for 3-week tier |

### Explicit non-choices

| Rejected | Why |
|----------|-----|
| LangGraph / CrewAI / OpenAI Agents SDK | &lt;5 LLM calls per txn path; framework &gt; benefit |
| Pinecone / Qdrant / Weaviate | Data volume too small; adds account + sync complexity |
| Python FastAPI in this repo | You already have `auto-tagging-agent`; capstone = TS platform story |
| Fine-tuning / Ollama / vLLM | 2-week scope; vendor rules + retrieval sufficient |
| Separate Redis/queue | Sync orchestrator OK for POC; document queue for production |
| Full OCR (Textract, etc.) | Mock receipt upload only |

---

## 3. ORM choice: Drizzle (recommended over Prisma)

| | Drizzle | Prisma |
|---|---------|--------|
| Migration clarity | SQL-forward, explicit | Abstracted |
| pgvector | Native extension in schema | Needs raw SQL anyway |
| Bundle size | Smaller | Heavier client |
| Learning curve | Steeper if new | Familiar to many |

**Lock:** Drizzle unless you have strong Prisma preference — document in README if you switch.

---

## 4. LLM & retrieval plan

### 4.1 Models by use case

| Use case | Model (default) | Calls / txn | Output |
|----------|-------------------|-------------|--------|
| Tagging suggestion | `gpt-4o-mini` | 1 | Zod: `gl_account_id`, `tax_code`, `dimensions`, `rationale` |
| Policy NL → JSON (admin) | `gpt-4o-mini` | 0 per txn (offline) | Zod: rule definitions |
| AP rationale | `gpt-4o-mini` | 0–1 per invoice | Prose from fixed numbers |
| Embeddings | `text-embedding-3-small` | 1 per new txn description | vector(1536) |

**Cost guardrails:** `LLM_ENABLE_LIVE_CALLS=false` for CI/eval replay with fixtures (pattern from `auto-tagging-agent`).

### 4.2 Retrieval (tagging hero)

| Stage | Technology | Notes |
|-------|------------|-------|
| Corpus | Labeled txns in Postgres | Tenant-scoped rows |
| Index | `pgvector` cosine similarity | Top-k = 5 default |
| Hybrid | **Defer** BM25 | Add only if recall@5 &lt; 80% on eval |
| Reranker | **None** in weeks 1–3 | Cohere/Voyage rerank in week 4+ if recall@5 &lt; 80% |
| Rule-first | SQL lookup on `vendor_rules` | Before any LLM call (port from Python MVP) |

### 4.3 Confidence (deterministic)

```text
confidence = weighted(
  rule_hit          → 1.0 cap,
  retrieval_sim     → max cosine in top-k,
  label_agreement   → % of neighbors with same GL,
  coa_valid         → boolean gate
)
```

Thresholds from env: `TAG_AUTO_THRESHOLD=0.92`, `TAG_REVIEW_THRESHOLD=0.75`.

---

## 5. Package manifest (initial)

### 5.1 Core dependencies

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.0",
    "zod": "^3.23.0",
    "openai": "^4.0.0",
    "@anthropic-ai/sdk": "^0.32.0",
    "nanoid": "^5.0.0",
    "date-fns": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "prettier": "^3.3.0"
  }
}
```

### 5.2 Optional (by week)

| Package | Purpose | When |
|---------|---------|------|
| `tailwindcss` + `shadcn/ui` | Review UI | Week 2 minimal; week 5 polish |
| `langfuse` | Trace LLM calls | Week 4+ (standard tier) |
| `@modelcontextprotocol/sdk` | Thin MCP server | Week 5 (standard tier) |
| `playwright` | E2E demo path | Week 6 (stretch) |

### 5.3 Scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx scripts/seed.ts",
    "eval:tagging": "tsx scripts/run-tagging-eval.ts",
    "demo": "tsx scripts/demo.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

---

## 6. Infrastructure

### 6.1 Docker Compose (local)

```yaml
# docker-compose.yml (planned)
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: cfo_capstone
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

### 6.2 Environment

See [`.env.example`](../.env.example). Required for week 1:

- `DATABASE_URL`
- `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` + `LLM_PROVIDER`)
- `TAG_AUTO_THRESHOLD` / `TAG_REVIEW_THRESHOLD`

### 6.3 Deploy (optional)

| Target | Service | When |
|--------|---------|------|
| App | Vercel (Next.js) | Day 12–14 if you want public URL |
| DB | Neon Postgres + pgvector | Same |
| Secrets | Vercel env vars | Never commit `.env.local` |

**Grader path:** `docker compose up` + `pnpm dev` on localhost is sufficient.

---

## 7. Repository layout (stack-aligned)

```text
src/
├── app/
│   ├── api/
│   │   ├── transactions/route.ts      # ingest + run pipeline
│   │   ├── review-queue/route.ts
│   │   └── invoices/route.ts          # AP stub
│   └── review/                        # UI pages
├── lib/
│   ├── db/
│   │   ├── schema.ts                  # Drizzle + pgvector
│   │   └── client.ts
│   ├── orchestrator/
│   │   ├── run-pipeline.ts
│   │   └── gates.ts                   # receipt blocks AUTO_TAG
│   ├── agents/
│   │   ├── policy/
│   │   ├── tagging/
│   │   └── ap/
│   ├── llm/
│   │   ├── client.ts                  # provider switch
│   │   ├── schemas.ts                 # Zod
│   │   └── prompts/
│   ├── confidence/
│   └── audit/
scripts/
├── seed.ts
├── run-tagging-eval.ts
└── demo.ts
eval/
└── tagging_eval.jsonl
tests/
├── unit/
└── integration/
```

---

## 8. Rollout calendar (May 27 – June 14, 2026)

Canonical day-by-day: [`schedule.md`](./schedule.md).

### Phase A — Foundation (May 28 – Jun 1)

| Date | Stack milestone |
|------|-----------------|
| **May 28** | `create-next-app` + Drizzle + Docker `pgvector/pg16` · migrations: `tenants`, `events`, `audit_log` |
| **May 29** | `review_queue`, `chart_of_accounts`, `scripts/seed.ts` |
| **May 31** | OpenAI client + Zod schemas in `src/lib/llm/` |
| **Jun 1** | pgvector on transaction text · rule store queries · Vitest setup |

### Phase B — Hero + gates (Jun 2 – Jun 6)

| Date | Stack milestone |
|------|-----------------|
| **Jun 2** | Confidence scorer + tri-state · orchestrator `run-pipeline.ts` |
| **Jun 3** | `pnpm eval:tagging` + `eval/tagging_eval.jsonl` (30 cases) |
| **Jun 4** | Policy evaluator (TS only) + `policy_version` on events |
| **Jun 5** | Receipt gate · AP module + invoice API |
| **Jun 6** | E2E API routes · `docs/architecture.md` v1 · `scripts/demo.ts` |

### Phase C — Polish & freeze (Jun 7 – Jun 10)

| Date | Stack milestone |
|------|-----------------|
| **Jun 7** | Minimal review UI (shadcn) **or** polished CLI |
| **Jun 8** | `docs/eval-results.md` · threshold tuning |
| **Jun 9** | `docs/demo-script.md` · deck draft |
| **Jun 10** | **CODE FREEZE** — `pnpm test` + `pnpm eval:tagging` green |

### Buffer & showcase (Jun 11 – 14)

| Date | Activity |
|------|----------|
| **Jun 11–13** | Rehearsal only; optional backup screen recording |
| **Jun 14** | Showcase demo (local Docker stack is fine) |

### Optional — only if Phase B done early (by Jun 6)

| Add-on | Effort | Cut if behind |
|--------|--------|---------------|
| Langfuse traces | ~4 hrs | Jun 8 |
| MCP thin server | ~6 hrs | Jun 9 |
| Vercel + Neon deploy | ~3 hrs | Jun 10 |
| Hybrid BM25 + pgvector | ~8 hrs | Always cut for this deadline |

### Stack features by June 10

| Capability | Jun 10 | Post-demo backlog |
|------------|--------|-------------------|
| Postgres + pgvector + Drizzle | ✓ required | — |
| Zod + OpenAI tagging | ✓ required | — |
| Policy TS evaluator | ✓ required | — |
| AP recommend-only | ✓ required | — |
| shadcn review UI | minimal OK | polish |
| Langfuse | optional | ✓ |
| MCP server | optional | ✓ |
| Vercel + Neon | optional | ✓ |
| Playwright E2E | cut | ✓ |

---

## 9. Mapping from `auto-tagging-agent` (Python MVP)

| Python MVP | Capstone (TypeScript) |
|------------|------------------------|
| FastAPI `POST /transactions/tag` | `POST /api/transactions` |
| SQLite stores | Postgres + Drizzle |
| `RuleStore` JSON | `vendor_rules` table |
| `Confidence Router` | `lib/confidence` + tri-state enum |
| `golden_gate.py` | `scripts/run-tagging-eval.ts` |
| `LLM_ENABLE_LIVE_CALLS` | Same env pattern |
| Random few-shot | pgvector top-k neighbors |
| `REVIEW_QUEUE` / `UNKNOWN` | `QUEUE_REVIEW` / `REFUSE` |

---

## 10. Cost estimate (POC scale)

Assumptions: 100 seed txns + 30 eval runs × 1 tagging call + embeddings.

| Item | Estimate |
|------|----------|
| `gpt-4o-mini` tagging | ~$0.50–2.00 total dev |
| `text-embedding-3-small` | &lt;$0.20 |
| Neon free tier | $0 |
| Vercel hobby | $0 |
| **Total POC** | **&lt;$5** with normal dev iteration |

Use `gpt-4o-mini` not `gpt-4o` unless eval quality requires it.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| pgvector setup friction | Use `pgvector/pgvector:pg16` image; document `CREATE EXTENSION vector` in migration |
| Next.js + long-running LLM | Use API route `maxDuration` (Vercel) or run eval scripts outside server |
| Drizzle learning curve | Start schema small (5 tables day 1); add tables incrementally |
| Scope creep to LangGraph | `cfo-capstone.mdc` forbids unless user explicitly requests |
| Eval flakiness with live LLM | Golden fixtures with `LLM_ENABLE_LIVE_CALLS=false` for CI |

---

## 12. Preferences checklist (fill before coding)

Use this if you want to override defaults:

- [ ] **LLM provider:** OpenAI / Anthropic / both (env switch)  
- [ ] **ORM:** Drizzle _(recommended)_ / Prisma  
- [ ] **UI depth:** Minimal shadcn / CLI-only  
- [ ] **Deploy:** Local only / Vercel+Neon  
- [ ] **Observability:** audit_log only / + Langfuse  
- [ ] **Target tier:** 3 / 4–5 / 6 weeks  
- [ ] **MCP:** Week 5 (standard) / skip (3-week)  

---

## 13. Next steps

1. Run scaffold: Next.js + Drizzle + `docker-compose.yml`  
2. Copy [`docs/tech-stack.md`](./tech-stack.md) decisions into [`docs/architecture.md`](./architecture.md) (week 1)  
3. Implement schema from [README data model](../README.md#data-model)  
4. Port golden eval cases from `auto-tagging-agent/tests/eval/fixtures/` → `eval/tagging_eval.jsonl`  

---

_Last updated: May 2026_
