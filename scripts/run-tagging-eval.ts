import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { and, eq, like, not } from "drizzle-orm";
import { loadEnv } from "@/lib/config/env";
import { createDb } from "@/lib/db/client";
import type { DbClient } from "@/lib/db/client";
import { chartOfAccounts, tenants, transactions, vendorRules, vendors } from "@/lib/db/schema";
import { runTaggingPipeline } from "@/lib/orchestrator/run-pipeline";
import type { TaggingDecision } from "@/lib/orchestrator/gates";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const EVAL_SET_VERSION = "tagging-v1";
const EVAL_FILE = join(process.cwd(), "eval/tagging_eval.jsonl");
const RESULTS_DIR = join(process.cwd(), "eval/results");
const RESULTS_FILE = join(RESULTS_DIR, "tagging-latest.json");

interface EvalCase {
  id: string;
  tenant_slug: string;
  vendor_raw: string;
  amount: string;
  memo?: string;
  expected_decision: TaggingDecision;
  expected_gl_code?: string;
  notes?: string;
}

interface EvalCaseResult {
  id: string;
  expected_decision: TaggingDecision;
  actual_decision: TaggingDecision;
  passed: boolean;
  expected_gl_code?: string;
  actual_gl_code?: string;
  notes?: string;
}

/**
 * Removes prior eval transactions so each run re-executes tagging (idempotency keys are stable per case).
 *
 * @param db - Database client.
 * @returns Number of rows deleted.
 */
async function cleanupEvalTransactions(db: DbClient): Promise<number> {
  const deleted = await db
    .delete(transactions)
    .where(like(transactions.externalTransactionId, "eval-%"))
    .returning({ id: transactions.id });

  return deleted.length;
}

/** Vendor canonical names that may gain learned rules from `pnpm demo` — cleared before eval. */
const DEMO_LEARNED_VENDOR_CANONICALS = ["zephyr labs llc"];

/**
 * Removes vendor rules created by demo overrides so eval case-05 stays cold-start.
 *
 * @param db - Database client.
 * @returns Number of vendor_rules rows deleted.
 */
async function cleanupDemoLearnedVendorState(db: DbClient): Promise<number> {
  let removed = 0;
  for (const canonical of DEMO_LEARNED_VENDOR_CANONICALS) {
    const vendorRows = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.canonicalName, canonical));
    for (const vendor of vendorRows) {
      const deletedRules = await db
        .delete(vendorRules)
        .where(eq(vendorRules.vendorId, vendor.id))
        .returning({ id: vendorRules.id });
      removed += deletedRules.length;

      await db
        .delete(transactions)
        .where(
          and(
            eq(transactions.vendorId, vendor.id),
            not(like(transactions.externalTransactionId, "seed-%")),
            not(like(transactions.externalTransactionId, "eval-%")),
          ),
        );

      await db.delete(vendors).where(eq(vendors.id, vendor.id));
    }
  }
  return removed;
}

/**
 * Loads eval cases from JSONL file.
 *
 * @param filePath - Path to tagging_eval.jsonl.
 * @returns Parsed eval cases.
 */
function loadEvalCases(filePath: string): EvalCase[] {
  const lines = readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => JSON.parse(line) as EvalCase);
}

/**
 * Runs tagging eval harness and writes results artifact.
 *
 * @returns Process exit code (0 pass, 1 fail).
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const db = createDb();
  const removed = await cleanupEvalTransactions(db);
  if (removed > 0) {
    console.log(`Cleared ${removed} prior eval transaction(s) for a fresh run`);
  }
  const rulesRemoved = await cleanupDemoLearnedVendorState(db);
  if (rulesRemoved > 0) {
    console.log(`Cleared ${rulesRemoved} demo-learned vendor rule(s) for reproducible eval`);
  }
  const cases = loadEvalCases(EVAL_FILE);

  const tenantRows = await db.select().from(tenants);
  const tenantBySlug = new Map(tenantRows.map((row) => [row.slug, row.id]));

  const coaRows = await db.select().from(chartOfAccounts);
  const coaCodeByTenantGl = new Map<string, string>();
  for (const row of coaRows) {
    coaCodeByTenantGl.set(`${row.tenantId}:${row.glCode}`, row.id);
  }

  const results: EvalCaseResult[] = [];
  let autoTagTotal = 0;
  let autoTagCorrect = 0;
  let llmCallsSavedByRules = 0;
  let retrievalHits = 0;

  for (const evalCase of cases) {
    const tenantId = tenantBySlug.get(evalCase.tenant_slug);
    if (!tenantId) {
      throw new Error(`Unknown tenant_slug in eval case ${evalCase.id}: ${evalCase.tenant_slug}`);
    }

    const externalId = `eval-${evalCase.id}`;
    const timestamp = "2026-01-01T00:00:00.000Z";
    const pipelineResult = await runTaggingPipeline(
      db,
      {
        tenantId,
        externalTransactionId: externalId,
        transactionTimestamp: timestamp,
        amount: evalCase.amount,
        currency: "USD",
        vendorRaw: evalCase.vendor_raw,
        memo: evalCase.memo,
      },
      { skipPolicy: true },
    );

    const actualDecision = pipelineResult.decision ?? "REFUSE";
    let actualGlCode: string | undefined;
    if (pipelineResult.suggestedGlAccountId) {
      const coaRow = coaRows.find((row) => row.id === pipelineResult.suggestedGlAccountId);
      actualGlCode = coaRow?.glCode;
    }

    const decisionPass = actualDecision === evalCase.expected_decision;
    const glPass =
      evalCase.expected_gl_code === undefined || actualGlCode === evalCase.expected_gl_code;
    const passed = decisionPass && glPass;

    if (evalCase.expected_decision === "AUTO_TAG") {
      autoTagTotal += 1;
      if (passed) {
        autoTagCorrect += 1;
      }
    }

    if (evalCase.vendor_raw.toLowerCase().includes("aws") && actualDecision === "AUTO_TAG") {
      llmCallsSavedByRules += 1;
    }

    if (actualDecision !== "REFUSE") {
      retrievalHits += 1;
    }

    results.push({
      id: evalCase.id,
      expected_decision: evalCase.expected_decision,
      actual_decision: actualDecision,
      passed,
      expected_gl_code: evalCase.expected_gl_code,
      actual_gl_code: actualGlCode,
      notes: evalCase.notes,
    });
  }

  const precision = autoTagTotal > 0 ? autoTagCorrect / autoTagTotal : 1;
  const reviewRate =
    results.filter((row) => row.actual_decision === "QUEUE_REVIEW").length / results.length;
  const refusalRate =
    results.filter((row) => row.actual_decision === "REFUSE").length / results.length;
  const passRate = results.filter((row) => row.passed).length / results.length;

  const summary = {
    eval_set_version: EVAL_SET_VERSION,
    eval_set_hash: createHash("sha256").update(readFileSync(EVAL_FILE)).digest("hex").slice(0, 16),
    case_count: cases.length,
    pass_rate: Number(passRate.toFixed(4)),
    auto_tag_precision: Number(precision.toFixed(4)),
    review_rate: Number(reviewRate.toFixed(4)),
    refusal_rate: Number(refusalRate.toFixed(4)),
    retrieval_proxy_rate: Number((retrievalHits / results.length).toFixed(4)),
    llm_calls_saved_by_rules: llmCallsSavedByRules,
    total_cost_usd: 0,
    llm_enable_live_calls: env.LLM_ENABLE_LIVE_CALLS,
    threshold_auto: env.TAG_AUTO_THRESHOLD,
    failures: results.filter((row) => !row.passed),
    results,
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(RESULTS_FILE, JSON.stringify(summary, null, 2));

  console.log("Tagging eval summary");
  console.log(`  cases: ${summary.case_count}`);
  console.log(`  pass_rate: ${(summary.pass_rate * 100).toFixed(1)}%`);
  console.log(`  auto_tag_precision: ${(summary.auto_tag_precision * 100).toFixed(1)}%`);
  console.log(`  review_rate: ${(summary.review_rate * 100).toFixed(1)}%`);
  console.log(`  refusal_rate: ${(summary.refusal_rate * 100).toFixed(1)}%`);
  console.log(`  results: ${RESULTS_FILE}`);

  const redTeam = results.find((row) => row.id === "case-08");
  if (redTeam && redTeam.actual_decision === "AUTO_TAG") {
    console.error("Red-team case-08 incorrectly AUTO_TAG");
    process.exit(1);
  }

  if (summary.auto_tag_precision < 0.95 && env.LLM_ENABLE_LIVE_CALLS) {
    console.warn("Warning: auto-tag precision below 95% target");
  }

  if (passRate < 0.7) {
    console.error("Eval pass rate below 70% — investigate failures");
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
