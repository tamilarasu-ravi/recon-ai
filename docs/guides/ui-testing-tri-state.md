# UI testing guide — tri-state decisions

Step-by-step instructions to exercise **AUTO_TAG**, **QUEUE_REVIEW**, and **REFUSE** in the browser and verify pipeline traces.

**Time:** ~5 minutes for all three · **Path:** Review queue → Add transaction → Transaction detail

---

## Before you start

1. Start the app and database:

   ```bash
   docker compose up -d
   pnpm db:migrate && pnpm db:seed
   pnpm dev
   ```

2. Open **http://localhost:3000** (or your Vercel preview URL).

3. In the header **Company** dropdown, pick the company noted for each scenario below.

### Demo companies (header dropdown)

| Pick in UI | Internal slug (API / eval only) |
|------------|----------------------------------|
| **Acme Labs** | `tenant-a` |
| **Northwind Trading** | `tenant-b` |

The UI never shows `tenant-a` / `tenant-b` — use **Acme Labs** and **Northwind Trading**.

### Environment (what shows in the trace)

| What you want to see | Set in `.env` / `.env.local` |
|----------------------|------------------------------|
| **Evidence plan** + conditional RAG skip (agentic v2) | `AGENTIC_EVIDENCE_ENABLED=true` |
| **Real LLM call** — prompt/completion tokens, model, cost | `LLM_ENABLE_LIVE_CALLS=true` + provider API key (`OPENAI_API_KEY` or `GOOGLE_API_KEY`) |
| Deterministic / mock LLM (CI-like, no token cost) | `LLM_ENABLE_LIVE_CALLS=false` |

Restart `pnpm dev` after changing env vars.

**Typical local demo (develop):**

```env
AGENTIC_EVIDENCE_ENABLED=true
LLM_ENABLE_LIVE_CALLS=true
LLM_PROVIDER=openai   # or google
```

On Vercel **production** (`main`), agentic is usually off. Use a **develop** preview for the full agentic trace story.

---

## Common UI path (every scenario)

1. **Review queue** → **Add transaction** — or go directly to `/review-queue/new`.
2. Under **Processing mode**, choose **Sync (wait for decision)** — simpler for demos than async polling.
3. Fill **Vendor**, **Amount**, **Memo** (see scenarios below).
4. Click **Submit transaction**.
5. When the ingest result shows a decision (or **Open transaction** link appears), open the transaction detail page.
6. On transaction detail, inspect the outcome:
   - **Decision badge** at the top (`Auto-coded` / `Needs review` / `Unclassified`).
   - **Run history** — expand the latest run → **Pipeline steps** (opens modal).
   - Or scroll to **Receipt** → **Reprocess only** — modal opens while reprocess runs, then replays the trace.

### What to look for in the Pipeline steps modal

| Trace step | When it appears |
|------------|-----------------|
| **Evidence plan** | `AGENTIC_EVIDENCE_ENABLED=true` — lists tools (`vendor_rules`, `similar_transactions`, …) |
| **RAG retrieval** — complete | Cold-start / no vendor rule — shows similar expense neighbors |
| **RAG retrieval** — skipped | Vendor rule sufficient (`vendor_rule_sufficient`) |
| **Tagging / LLM** — *LLM skipped* | Vendor rule hit — no model call |
| **Tagging / LLM** — token counts | `LLM_ENABLE_LIVE_CALLS=true` — prompt + completion tokens, model, cost |
| **Evidence verify** | Agentic on — heuristic verifier concerns (if any) |
| **Tri-state decision** | Final `AUTO_TAG` / `QUEUE_REVIEW` / `REFUSE` + reason |

Footer **Complete** means the whole run finished (not per-row status). Stale **Running** rows may show **completed — next phase** after a matching complete step exists.

---

## Scenario 1 — AUTO_TAG (vendor rule)

**Goal:** Known vendor with seeded rule → high confidence auto-code. LLM skipped.

| Field | Value |
|-------|--------|
| **Company** | **Acme Labs** |
| **Vendor** | `slack` (from dropdown) |
| **Amount** | `45.00` |
| **Memo** | `team plan` |
| **Processing** | Sync |

**Expected decision:** **Auto-coded** (`AUTO_TAG`) · GL **6100** (Software & Cloud)

**Say:** “Seeded vendor rule hits first — we skip the LLM and still pass deterministic confidence + tri-state gates.”

**Pipeline trace (agentic on):**

- Evidence plan — often includes `vendor_rules`
- RAG retrieval — **skipped** (`vendor_rule_sufficient`)
- Tagging / LLM — **LLM skipped** (matched vendor rule)
- No prompt tokens unless you forced a cold-start vendor

**Preset shortcut:** On `/review-queue/new`, choose preset **Slack $45 — vendor rule**.

**Alternative:** **AWS $50 — under receipt threshold** preset (same AUTO_TAG pattern).

---

## Scenario 2 — QUEUE_REVIEW (cold-start vendor + LLM)

**Goal:** New vendor, no rule → retrieval + LLM → queue for human review (never silent wrong GL).

| Field | Value |
|-------|--------|
| **Company** | **Acme Labs** |
| **Vendor** | `Zephyr Labs LLC` — choose **Custom vendor…** and type exactly |
| **Amount** | `1200.00` |
| **Memo** | `consulting` |
| **Processing** | Sync |

**Expected decision:** **Needs review** (`QUEUE_REVIEW`)

**Say:** “No vendor rule yet — we gather evidence, call the LLM once, and queue rather than auto-posting a guess.”

**Pipeline trace (agentic + live LLM on):**

- **Evidence plan** — should include `similar_transactions` (and possibly `policy_context`)
- **RAG retrieval** — **complete** with neighbor list (similar seeded AWS/Slack txns)
- **Tagging / LLM** — **not** “LLM skipped”; shows **prompt tokens**, **model**, **cost** when live calls enabled
- **Evidence verify** — heuristic pass or soft concerns
- Decision **QUEUE_REVIEW**

**Important — learned rule drift:** If you already ran [Option D in the demo script](../demo-script.md#option-d--vendor-rule-learning-ui--skill-reuse) (Zephyr override → vendor rule), the **second** Zephyr txn may **AUTO_TAG** to GL 6200 instead. For a clean cold-start test:

- Use a **different unknown vendor** (e.g. `Niche Vendor Co`, `Obscure SaaS Tool`, amount `199.00`), **or**
- Re-seed / remove the Zephyr vendor rule in the DB before testing.

**Alternative QUEUE_REVIEW (known vendor, review band):**

| Vendor | Amount | Memo | Notes |
|--------|--------|------|-------|
| `starbucks` | `14.50` | `coffee` | T&E GL 6300 — often queues instead of auto-tag |

Preset: **Unknown courier — new vendor** also lands in review/refuse territory but is less reliable for “LLM always runs” than Zephyr cold-start.

---

## Scenario 3 — REFUSE (unknown merchant)

**Goal:** System refuses to guess GL — **Unclassified** (`REFUSE`).

### Option A — Northwind Trading (demo REFUSE path)

| Field | Value |
|-------|--------|
| **Company** | **Northwind Trading** |
| **Vendor** | `Unknown Courier 42` (custom) |
| **Amount** | `60.00` |
| **Memo** | *(empty or any)* |
| **Processing** | Sync |

**Expected decision:** **Unclassified** (`REFUSE`) · reason along the lines of `unknown_vendor_pattern`

**Say:** “We refuse to silently miscoding — better than posting to the wrong GL.”

### Option B — Acme Labs

| Field | Value |
|-------|--------|
| **Company** | **Acme Labs** |
| **Vendor** | `Mystery Merchant` (custom) |
| **Amount** | `75.00` |
| **Memo** | *(empty)* |

**Expected decision:** **REFUSE** (eval case-07)

**Pipeline trace:** Policy + tagging may still run; tri-state step shows **REFUSE** with audit reason. LLM may or may not run depending on confidence path — decision must not be silent wrong GL.

**Preset shortcut (Acme Labs):** **Unknown courier — new vendor** — may be `QUEUE_REVIEW` or `REFUSE`; for guaranteed REFUSE use Northwind Trading Option A.

---

## Quick reference

| Decision | Company | Vendor | Amount | Memo | Trace highlights |
|----------|---------|--------|--------|------|------------------|
| **AUTO_TAG** | Acme Labs | `slack` | 45.00 | team plan | RAG skipped · LLM skipped |
| **QUEUE_REVIEW** | Acme Labs | `Zephyr Labs LLC` | 1200.00 | consulting | Evidence plan · RAG neighbors · LLM tokens (live) |
| **REFUSE** | Northwind Trading | `Unknown Courier 42` | 60.00 | — | REFUSE · unknown vendor reason |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Zephyr → **Auto-coded** instead of Needs review | Learned vendor rule from prior override demo | Use another cold-start vendor or re-seed |
| No **Evidence plan** step | Agentic flag off | `AGENTIC_EVIDENCE_ENABLED=true` + restart dev |
| **LLM skipped** on Zephyr | Unexpected vendor rule hit | Clear Zephyr rule or use different vendor |
| No **tokens / cost** in trace | Mock LLM mode | `LLM_ENABLE_LIVE_CALLS=true` + API key |
| Trace empty on first open | Sync ingest finished before modal | **Run history** → **Pipeline steps**, or **Reprocess only** |
| Wrong tenant CoA / decision | Header company mismatch | Confirm **Acme Labs** vs **Northwind Trading** in header |

---

## Related docs

- [Demo script — Option D (vendor learning)](../demo-script.md#option-d--vendor-rule-learning-ui--skill-reuse)
- [Demo script — Option E (agentic evidence)](../demo-script.md#option-e--agentic-evidence-develop--preview-only)
- [Agentic v2 implementation plan](../../planning/agentic-v2-implementation-plan.md)
- [Eval results](../eval-results.md) — 30-case proof set aligned with these scenarios
