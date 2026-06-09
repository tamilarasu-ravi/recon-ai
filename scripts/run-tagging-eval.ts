import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { and, desc, eq, like, not } from "drizzle-orm";
import { loadEnv } from "@/lib/config/env";
import { getDb, getRootDb } from "@/lib/db/client";
import { runWithRlsBypass, runWithTenantRls } from "@/lib/db/tenant-rls";
import { closeCliResources, runCliScript } from "./lib/close-cli-resources.js";
import type { DbClient } from "@/lib/db/client";
import { auditLog, chartOfAccounts, tenants, transactions, vendorRules, vendors } from "@/lib/db/schema";
import {
  computeRetrievalRecallAt5,
  didRetrievalRecallHit,
  isRetrievalRecallEligible,
  RETRIEVAL_RECALL_AT_5_TARGET,
  type RetrievalRecallCaseResult,
} from "@/lib/eval/retrieval-recall";
import { parseLlmUsageFromObservability } from "@/lib/observability/llm-cost";
import { runTaggingPipeline } from "@/lib/orchestrator/run-pipeline";
import type { TaggingDecision } from "@/lib/orchestrator/gates";
import { parseRetrievalFromObservability } from "@/lib/ui/parse-retrieval";

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
  /** When false, excluded from retrieval recall@5 denominator. */
  expect_retrieval_recall?: boolean;
  /** Human-readable failure mode this case guards against (Phase 6 eval plan). */
  failure_mode?: string;
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
  getRootDb();

  const cases = loadEvalCases(EVAL_FILE);
  const results: EvalCaseResult[] = [];
  let autoTagTotal = 0;
  let autoTagCorrect = 0;
  let llmCallsSavedByRules = 0;
  const retrievalRecallCases: RetrievalRecallCaseResult[] = [];
  let totalCostUsd = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  await runWithRlsBypass(async () => {
    const db = getDb();
    const removed = await cleanupEvalTransactions(db);
    if (removed > 0) {
      console.log(`Cleared ${removed} prior eval transaction(s) for a fresh run`);
    }
    const rulesRemoved = await cleanupDemoLearnedVendorState(db);
    if (rulesRemoved > 0) {
      console.log(`Cleared ${rulesRemoved} demo-learned vendor rule(s) for reproducible eval`);
    }

    const tenantRows = await db.select().from(tenants);
    const tenantBySlug = new Map(tenantRows.map((row) => [row.slug, row.id]));

    const coaRows = await db.select().from(chartOfAccounts);

    console.log(
      `Running ${cases.length} eval case(s) (live LLM=${env.LLM_ENABLE_LIVE_CALLS}) — this may take a few minutes…`,
    );

    for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
      const evalCase = cases[caseIndex]!;
      const tenantId = tenantBySlug.get(evalCase.tenant_slug);
      if (!tenantId) {
        throw new Error(`Unknown tenant_slug in eval case ${evalCase.id}: ${evalCase.tenant_slug}`);
      }

      const externalId = `eval-${evalCase.id}`;
      const timestamp = "2026-01-01T00:00:00.000Z";
      process.stdout.write(
        `  [${caseIndex + 1}/${cases.length}] ${evalCase.id} … `,
      );

      await runWithTenantRls(tenantId, async () => {
        const scopedDb = getDb();
        const pipelineResult = await runTaggingPipeline(
          scopedDb,
          {
            tenantId,
            externalTransactionId: externalId,
            transactionTimestamp: timestamp,
            amount: evalCase.amount,
            currency: "USD",
            vendorRaw: evalCase.vendor_raw,
            memo: evalCase.memo,
          },
          { skipPolicy: true, skipHitl: true },
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

        const [taggingAudit] = await scopedDb
          .select({ observability: auditLog.observability })
          .from(auditLog)
          .where(and(eq(auditLog.runId, pipelineResult.runId), eq(auditLog.agent, "tagging")))
          .orderBy(desc(auditLog.createdAt))
          .limit(1);

        if (taggingAudit?.observability && typeof taggingAudit.observability === "object") {
          const usage = parseLlmUsageFromObservability(
            taggingAudit.observability as Record<string, unknown>,
          );
          totalCostUsd += usage.costUsd;
          totalPromptTokens += usage.promptTokens;
          totalCompletionTokens += usage.completionTokens;
        }

        const recallEligible = isRetrievalRecallEligible(evalCase);
        let neighborGlCodes: string[] = [];
        if (taggingAudit?.observability) {
          const parsed = parseRetrievalFromObservability(taggingAudit.observability);
          neighborGlCodes =
            parsed?.neighbors
              .map((neighbor) => neighbor.glCode)
              .filter((code): code is string => code !== null) ?? [];
        }

        retrievalRecallCases.push({
          id: evalCase.id,
          eligible: recallEligible,
          hit:
            recallEligible && evalCase.expected_gl_code
              ? didRetrievalRecallHit(taggingAudit?.observability, evalCase.expected_gl_code)
              : null,
          expected_gl_code: evalCase.expected_gl_code,
          neighbor_gl_codes: neighborGlCodes,
        });

        results.push({
          id: evalCase.id,
          expected_decision: evalCase.expected_decision,
          actual_decision: actualDecision,
          passed,
          expected_gl_code: evalCase.expected_gl_code,
          actual_gl_code: actualGlCode,
          notes: evalCase.notes,
        });

        const status = passed ? "pass" : "FAIL";
        console.log(
          `${actualDecision}${actualGlCode ? ` → ${actualGlCode}` : ""} (${status}, expected ${evalCase.expected_decision})`,
        );
      });
    }
  });

  const precision = autoTagTotal > 0 ? autoTagCorrect / autoTagTotal : 1;
  const reviewRate =
    results.filter((row) => row.actual_decision === "QUEUE_REVIEW").length / results.length;
  const refusalRate =
    results.filter((row) => row.actual_decision === "REFUSE").length / results.length;
  const passRate = results.filter((row) => row.passed).length / results.length;
  const retrievalRecallAt5 = computeRetrievalRecallAt5(retrievalRecallCases);
  const retrievalRecallEligibleCount = retrievalRecallCases.filter((row) => row.eligible).length;
  const retrievalRecallHitCount = retrievalRecallCases.filter((row) => row.hit === true).length;

  const summary = {
    eval_set_version: EVAL_SET_VERSION,
    eval_set_hash: createHash("sha256").update(readFileSync(EVAL_FILE)).digest("hex").slice(0, 16),
    case_count: cases.length,
    pass_rate: Number(passRate.toFixed(4)),
    auto_tag_precision: Number(precision.toFixed(4)),
    review_rate: Number(reviewRate.toFixed(4)),
    refusal_rate: Number(refusalRate.toFixed(4)),
    retrieval_recall_at_5: retrievalRecallAt5,
    retrieval_recall_eligible_count: retrievalRecallEligibleCount,
    retrieval_recall_hit_count: retrievalRecallHitCount,
    retrieval_recall_cases: retrievalRecallCases,
    llm_calls_saved_by_rules: llmCallsSavedByRules,
    total_cost_usd: Number(totalCostUsd.toFixed(6)),
    total_prompt_tokens: totalPromptTokens,
    total_completion_tokens: totalCompletionTokens,
    total_tokens: totalPromptTokens + totalCompletionTokens,
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
  console.log(
    `  retrieval_recall@5: ${(summary.retrieval_recall_at_5 * 100).toFixed(1)}% (${retrievalRecallHitCount}/${retrievalRecallEligibleCount} eligible)`,
  );
  console.log(`  total_cost_usd: ${summary.total_cost_usd}`);
  console.log(`  total_tokens: ${summary.total_tokens}`);
  console.log(`  results: ${RESULTS_FILE}`);

  const redTeam = results.find((row) => row.id === "case-08");
  if (redTeam && redTeam.actual_decision === "AUTO_TAG") {
    console.error("Red-team case-08 incorrectly AUTO_TAG");
    await closeCliResources();
    process.exit(1);
  }

  if (summary.auto_tag_precision < 0.95 && env.LLM_ENABLE_LIVE_CALLS) {
    console.warn("Warning: auto-tag precision below 95% target");
  }

  if (passRate < 0.7) {
    console.error("Eval pass rate below 70% — investigate failures");
    await closeCliResources();
    process.exit(1);
  }

  if (summary.retrieval_recall_at_5 < RETRIEVAL_RECALL_AT_5_TARGET) {
    const misses = retrievalRecallCases.filter((row) => row.eligible && row.hit !== true);
    console.error(
      `Retrieval recall@5 ${(summary.retrieval_recall_at_5 * 100).toFixed(1)}% below ${(RETRIEVAL_RECALL_AT_5_TARGET * 100).toFixed(0)}% target`,
    );
    for (const miss of misses) {
      console.error(
        `  ${miss.id}: expected GL ${miss.expected_gl_code}, neighbors=[${miss.neighbor_gl_codes.join(", ")}]`,
      );
    }
    await closeCliResources();
    process.exit(1);
  }
}

runCliScript(main);
