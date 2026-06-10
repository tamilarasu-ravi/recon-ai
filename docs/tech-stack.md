# Tech stack — ReconAI platform

**Status:** Locked (Phase 1 shipped)  
**Companion docs:** [`README.md`](../README.md) · [`architecture.md`](./architecture.md) · [`product-roadmap.md`](./product-roadmap.md) · [`.env.example`](../.env.example)  
**Planning reference:** [`capstone-poc-planner/phases/05-tech-stack.md`](../capstone-poc-planner/phases/05-tech-stack.md)

---

## 1. Planning principles

| Principle                            | Implication                                                         |
| ------------------------------------ | ------------------------------------------------------------------- |
| **One repo, one language**           | TypeScript end-to-end (API, orchestrator, eval CLI)                 |
| **Postgres is the system of record** | Events, audit, tenants, rules, vectors in one DB                    |
| **LLM for judgment, code for truth** | GL allow-list, confidence, policy eval, AP math = deterministic     |
| **Eval-driven**                      | `pnpm eval:tagging` + `pnpm eval:gate` on every tagging change      |
| **Agent-native**                     | MCP + REST parity with operator UI                                  |
| **Portable demo**                    | Docker Compose locally; Vercel + Neon optional ([vercel-deploy.md](./vercel-deploy.md)) |

**Reference implementation:** [`auto-tagging-agent`](../../tech-interview/auto-tagging-agent) (Python) — reuse **patterns** (rule-first, confidence router, golden evals), not the runtime.

**Pitch source:** [`PITCH-cfo-operations-platform.md`](./PITCH-cfo-operations-platform.md)

---

## 2. Stack overview (Phase 1)

```text
┌─────────────────────────────────────────────────────────────┐
│  Operator UI (Next.js 15 App Router)                        │
│  home · review queue · txn detail · policy · AP · settings  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Application layer (Node 22+, TypeScript 5.x)               │
│  • API routes + webhooks                                      │
│  • LangGraph orchestrator (tagging + AP graphs) + gates       │
│  • Agents: policy · tagging · AP                              │
│  • Zod schemas · LLM client · confidence scorer               │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ PostgreSQL 16 │   │ Gemini (def)  │   │ Langfuse      │
│ + pgvector    │   │ OpenAI /      │   │ (optional)    │
│ Drizzle ORM   │   │ Anthropic     │   │               │
└───────────────┘   └───────────────┘   └───────────────┘
┌─────────────────────────────────────────────────────────────┐
│  MCP server (`pnpm mcp`) · Playwright smoke E2E               │
└─────────────────────────────────────────────────────────────┘
```

### Decision table

| Dimension             | Choice                                                | Notes                                                       |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| **Runtime**           | Node.js **22+**                                       | See `package.json` `engines`                                |
| **Language**          | **TypeScript** strict                                 | Zod + Drizzle types                                         |
| **Framework**         | **Next.js 15** (App Router)                           | API + operator UI in one deployable unit                    |
| **Database**          | **PostgreSQL 16** + **pgvector**                      | Docker host port **5434** (see `docker-compose.yml`)        |
| **ORM**               | **Drizzle ORM**                                       | Migrations in repo; no Prisma                               |
| **LLM provider**      | **Google Gemini** default                             | `LLM_PROVIDER=openai` or `anthropic` via env                |
| **Embeddings**        | `gemini-embedding-001` (768-d) default                | OpenAI `text-embedding-3-small` optional                    |
| **Orchestration**     | **LangGraph** + deterministic gates                   | `src/lib/orchestrator/langgraph/`                           |
| **Validation**        | **Zod**                                               | All LLM JSON boundaries                                     |
| **Policy engine**     | **TypeScript** evaluator + NL compile (admin)         | Built-in rule types only at runtime                         |
| **UI**                | Next.js + CSS modules / app styles                    | Finance-facing copy; settings feature flags for showcase    |
| **CLI / seeds**       | **tsx** + `scripts/`                                  | `db:seed`, `eval:tagging`, `demo`, `showcase:prep`          |
| **Testing**           | **node:test** + **Playwright** smoke                  | `pnpm test`, `pnpm test:e2e`                                |
| **Observability**     | `audit_log` step traces + optional **Langfuse**       | `run_id` on every agent run                                 |
| **Local infra**       | **Docker Compose**                                    | `pgvector/pgvector:pg16`                                    |
| **Deploy**            | **Vercel** + **Neon** (optional)                      | [vercel-deploy.md](./vercel-deploy.md)                      |

### Explicit non-choices

| Rejected                     | Why                                              |
| ---------------------------- | ------------------------------------------------ |
| CrewAI / multi-agent chat    | Structured graphs + gates; not chat orchestration |
| Pinecone / Qdrant / Weaviate | pgvector sufficient at current scale             |
| Python sidecar in this repo  | TS platform; Python reference repo separate        |
| Fine-tuning / local GPU      | Vendor rules + retrieval sufficient              |
| Full OCR pipeline            | Mock receipt upload only                         |

---

## 3. ORM choice: Drizzle (recommended over Prisma)

|                   | Drizzle                    | Prisma               |
| ----------------- | -------------------------- | -------------------- |
| Migration clarity | SQL-forward, explicit      | Abstracted           |
| pgvector          | Native extension in schema | Needs raw SQL anyway |
| Bundle size       | Smaller                    | Heavier client       |
| Learning curve    | Steeper if new             | Familiar to many     |

**Lock:** Drizzle unless you have strong Prisma preference — document in README if you switch.

---

## 4. LLM & retrieval plan

### 4.1 Models by use case

| Use case                 | Model (default)          | Calls / txn               | Output                                                      |
| ------------------------ | ------------------------ | ------------------------- | ----------------------------------------------------------- |
| Tagging suggestion       | `gemini-2.5-flash` (default) | 0–1 per txn           | Zod: GL, tax, dimensions, rationale                         |
| Policy NL → JSON (admin) | same family                  | 0 per txn (offline)   | Zod: rule definitions                                       |
| AP rationale             | same family                  | 0–1 per invoice       | Prose from fixed numbers                                    |
| Embeddings               | `gemini-embedding-001`       | 1 per new txn text    | vector(768) default                                         |

**Cost guardrails:** `LLM_ENABLE_LIVE_CALLS=false` for CI/eval replay with fixtures (pattern from `auto-tagging-agent`).

### 4.2 Retrieval (tagging hero)

| Stage      | Technology                   | Notes                                                |
| ---------- | ---------------------------- | ---------------------------------------------------- |
| Corpus     | Labeled txns in Postgres     | Tenant-scoped rows                                   |
| Index      | `pgvector` cosine similarity | Top-k = 5 default                                    |
| Hybrid     | **Defer** BM25               | Add only if recall@5 drops below gate on eval           |
| Reranker   | **None**                     | Revisit if recall@5 &lt; 80% sustained                    |
| Rule-first | SQL lookup on `vendor_rules` | Before any LLM call (port from Python MVP)           |

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

| Package                     | Purpose         | When                          |
| --------------------------- | --------------- | ----------------------------- |
| `tailwindcss` + `shadcn/ui` | Review UI       | Week 2 minimal; week 5 polish |
| `langfuse`                  | Trace LLM calls | Week 4+ (standard tier)       |
| `@modelcontextprotocol/sdk` | Thin MCP server | Week 5 (standard tier)        |
| `playwright`                | E2E demo path   | Week 6 (stretch)              |

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
      - "5434:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

### 6.2 Environment

See [`.env.example`](../.env.example). Required for local dev:

- `DATABASE_URL` (port **5434** with Docker Compose)
- `GOOGLE_API_KEY` or `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` + `LLM_PROVIDER`
- `TAG_AUTO_THRESHOLD` / `TAG_REVIEW_THRESHOLD`
- `LLM_ENABLE_LIVE_CALLS=false` for deterministic eval/CI replay

### 6.3 Deploy (optional)

| Target  | Service                  | When                             |
| ------- | ------------------------ | -------------------------------- |
| App     | Vercel (Next.js)         | Day 12–14 if you want public URL |
| DB      | Neon Postgres + pgvector | Same                             |
| Secrets | Vercel env vars          | Never commit `.env.local`        |

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

## 8. Phase 1 shipped capabilities

| Capability                    | Status      | Command / location                    |
| ----------------------------- | ----------- | ------------------------------------- |
| Postgres + pgvector + Drizzle | Shipped     | `docker compose up`, `pnpm db:migrate` |
| LangGraph tagging + AP graphs | Shipped     | `src/lib/orchestrator/langgraph/`     |
| Zod + multi-provider LLM      | Shipped     | `src/lib/llm/`                        |
| Policy TS evaluator + NL compile | Shipped  | `/policy`, `POST /api/policies/compile` |
| AP recommend-only             | Shipped     | `/ap`, AP graph                       |
| Operator UI                   | Shipped     | home, review queue, txn detail, settings |
| MCP server                    | Shipped     | `pnpm mcp`                            |
| Langfuse export               | Optional    | [langfuse-setup.md](./langfuse-setup.md) |
| Playwright smoke E2E          | Shipped     | `pnpm test:e2e`                       |
| Eval harness + regression gate | Shipped    | `pnpm eval:tagging`, `pnpm eval:gate` |
| Vercel + Neon deploy          | Documented  | [vercel-deploy.md](./vercel-deploy.md) |
| Hybrid BM25 + pgvector        | Deferred    | pgvector only until recall gap        |

**Next phases:** [product-roadmap.md](./product-roadmap.md) · [production-roadmap.md](./production-roadmap.md)

---

## 9. Mapping from `auto-tagging-agent` (Python MVP)

| Python MVP                       | Capstone (TypeScript)             |
| -------------------------------- | --------------------------------- |
| FastAPI `POST /transactions/tag` | `POST /api/transactions`          |
| SQLite stores                    | Postgres + Drizzle                |
| `RuleStore` JSON                 | `vendor_rules` table              |
| `Confidence Router`              | `lib/confidence` + tri-state enum |
| `golden_gate.py`                 | `scripts/run-tagging-eval.ts`     |
| `LLM_ENABLE_LIVE_CALLS`          | Same env pattern                  |
| Random few-shot                  | pgvector top-k neighbors          |
| `REVIEW_QUEUE` / `UNKNOWN`       | `QUEUE_REVIEW` / `REFUSE`         |

---

## 10. Cost estimate (POC scale)

Assumptions: 100 seed txns + 30 eval runs × 1 tagging call + embeddings.

| Item                     | Estimate                             |
| ------------------------ | ------------------------------------ |
| `gpt-4o-mini` tagging    | ~$0.50–2.00 total dev                |
| `text-embedding-3-small` | &lt;$0.20                            |
| Neon free tier           | $0                                   |
| Vercel hobby             | $0                                   |
| **Total POC**            | **&lt;$5** with normal dev iteration |

Use `gpt-4o-mini` not `gpt-4o` unless eval quality requires it.

---

## 11. Risks & mitigations

| Risk                         | Mitigation                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| pgvector setup friction      | Use `pgvector/pgvector:pg16` image; document `CREATE EXTENSION vector` in migration |
| Next.js + long-running LLM   | Use API route `maxDuration` (Vercel) or run eval scripts outside server             |
| Drizzle learning curve       | Start schema small (5 tables day 1); add tables incrementally                       |
| Scope creep to LangGraph     | `cfo-capstone.mdc` forbids unless user explicitly requests                          |
| Eval flakiness with live LLM | Golden fixtures with `LLM_ENABLE_LIVE_CALLS=false` for CI                           |

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

## 13. Next steps (Phase 2+)

1. See [production-roadmap.md](./production-roadmap.md) for P4 integrations and P5 enterprise work.
2. Run `pnpm showcase:prep` before releases that touch tagging thresholds or gates.
3. Keep [eval-results.md](./eval-results.md) in sync via `pnpm eval:results-doc`.

---

_Last updated: Phase 1 final_
