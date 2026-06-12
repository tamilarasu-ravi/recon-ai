import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { and, desc, eq, like, not } from "drizzle-orm";
import { loadEnv } from "@/lib/config/env";
import { closeDb, getDb, getRootDb } from "@/lib/db/client";
import { runWithRlsBypass, runWithTenantRls } from "@/lib/db/tenant-rls";
import { closeOrchestratorCheckpointer } from "@/lib/orchestrator/langgraph/checkpointer";
import { closeCliResources, runCliScript } from "./lib/close-cli-resources.js";
import { syncAllSeedVendorRules } from "./lib/tenant-seed-config.js";
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
import {
  parseRetrievalFromObservability,
  wasPlannerFallbackInObservability,
  wasRetrievalSkippedInObservability,
} from "@/lib/ui/parse-retrieval";

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
  /** When set with agentic flag on, assert retrieval skip status. */
  expect_retrieval_skipped?: boolean;
  /** Agentic-only assertions skipped when AGENTIC_EVIDENCE_ENABLED=false. */
  requires_agentic_flag?: boolean;
}

interface EvalCaseResult {
  id: string;
  expected_decision: TaggingDecision;
  actual_decision: TaggingDecision;
  passed: boolean;
  expected_gl_code?: string;
  actual_gl_code?: string;
  notes?: string;
  retrieval_skipped?: boolean;
  agentic_assertion_passed?: boolean;
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

const EVAL_DB_MAX_ATTEMPTS = 3;
const EVAL_DB_RETRY_DELAY_MS = 2_000;

/**
 * Returns true when a postgres.js error is likely recoverable with reconnect.
 *
 * @param error - Caught error from pipeline or query.
 * @returns Whether to retry after resetting the client pool.
 */
function isTransientPostgresError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: string }).code;
  return (
    code === "CONNECTION_CLOSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "57P01"
  );
}

/**
 * Closes pooled postgres and LangGraph checkpointer handles between eval retries.
 *
 * @returns Promise that resolves when pools are drained.
 */
async function resetEvalDbConnections(): Promise<void> {
  await closeDb();
  await closeOrchestratorCheckpointer();
}

/**
 * Waits for a fixed interval before retrying a failed eval case.
 *
 * @param ms - Delay in milliseconds.
 * @returns Promise that resolves after the delay.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Runs one eval case body with reconnect retries on Neon pooler drops.
 *
 * @param caseId - Eval case id for log context.
 * @param fn - Case work to execute.
 * @returns Result of the case callback.
 * @throws Rethrows non-transient errors or after max attempts.
 */
async function withEvalDbRetry<T>(caseId: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= EVAL_DB_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientPostgresError(error) || attempt >= EVAL_DB_MAX_ATTEMPTS) {
        throw error;
      }

      const code = (error as { code?: string }).code ?? "unknown";
      console.warn(
        `\n  ${caseId}: DB connection lost (${code}) — retry ${attempt + 1}/${EVAL_DB_MAX_ATTEMPTS}…`,
      );
      await resetEvalDbConnections();
      getRootDb();
      await sleep(EVAL_DB_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

/**
 * Reads tri-state reason from tagging audit observability steps.
 *
 * @param observability - Raw audit_log.observability JSON.
 * @returns Decision reason code or undefined.
 */
function getDecisionReasonFromObservability(observability: unknown): string | undefined {
  if (!observability || typeof observability !== "object") {
    return undefined;
  }

  const steps = (observability as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) {
    return undefined;
  }

  for (const step of steps) {
    if (
      typeof step === "object" &&
      step !== null &&
      "name" in step &&
      (step as { name: string }).name === "tri_state_decision" &&
      "detail" in step &&
      typeof (step as { detail?: unknown }).detail === "object" &&
      (step as { detail: { reason?: unknown } }).detail !== null
    ) {
      const reason = (step as { detail: { reason?: unknown } }).detail.reason;
      return typeof reason === "string" ? reason : undefined;
    }
  }

  return undefined;
}

/**
 * Loads tagging audit observability for a pipeline run, falling back to the latest audit for the transaction.
 *
 * @param db - Database client.
 * @param runId - Orchestrator run id from pipeline result.
 * @param transactionId - Transaction UUID.
 * @returns Observability JSON or undefined when no tagging audit exists.
 */
async function loadTaggingObservability(
  db: DbClient,
  runId: string,
  transactionId: string,
): Promise<unknown | undefined> {
  const [byRun] = await db
    .select({ observability: auditLog.observability })
    .from(auditLog)
    .where(and(eq(auditLog.runId, runId), eq(auditLog.agent, "tagging")))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  if (byRun?.observability) {
    return byRun.observability;
  }

  const [byTransaction] = await db
    .select({ observability: auditLog.observability })
    .from(auditLog)
    .where(and(eq(auditLog.transactionId, transactionId), eq(auditLog.agent, "tagging")))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  return byTransaction?.observability;
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
  let retrievalSkippedCount = 0;
  let verifierForceReviewCount = 0;
  let plannerFallbackCount = 0;
  let agenticAssertionFailures: string[] = [];

  // Commit cleanup in its own transaction so tenant-scoped eval runs see deleted rows.
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
    const rulesSynced = await syncAllSeedVendorRules(db);
    if (rulesSynced > 0) {
      console.log(`Restored ${rulesSynced} seeded vendor rule(s) after demo overrides`);
    }
  });

  await runWithRlsBypass(async () => {
    const db = getDb();

    const tenantRows = await db.select().from(tenants);
    const tenantBySlug = new Map(tenantRows.map((row) => [row.slug, row.id]));

    const coaRows = await db.select().from(chartOfAccounts);

    console.log(
      `Running ${cases.length} eval case(s) (live LLM=${env.LLM_ENABLE_LIVE_CALLS}, agentic=${env.AGENTIC_EVIDENCE_ENABLED}) — this may take a few minutes…`,
    );
    if (process.env.DATABASE_URL?.includes("-pooler.")) {
      console.log(
        "Neon pooler detected — transient CONNECTION_CLOSED errors will retry up to 3× per case.",
      );
    }

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

      await withEvalDbRetry(evalCase.id, async () =>
        runWithTenantRls(tenantId, async () => {
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

        const observability = await loadTaggingObservability(
          scopedDb,
          pipelineResult.runId,
          pipelineResult.transactionId,
        );

        const decisionPass = actualDecision === evalCase.expected_decision;
        const glPass =
          evalCase.expected_gl_code === undefined || actualGlCode === evalCase.expected_gl_code;

        const retrievalSkipped = observability
          ? wasRetrievalSkippedInObservability(observability)
          : false;

        if (retrievalSkipped) {
          retrievalSkippedCount += 1;
        }

        if (observability && wasPlannerFallbackInObservability(observability)) {
          plannerFallbackCount += 1;
        }

        if (
          actualDecision === "QUEUE_REVIEW" &&
          observability &&
          getDecisionReasonFromObservability(observability)?.startsWith("verifier_")
        ) {
          verifierForceReviewCount += 1;
        }

        let agenticAssertionPassed = true;
        if (
          env.AGENTIC_EVIDENCE_ENABLED &&
          evalCase.requires_agentic_flag &&
          evalCase.expect_retrieval_skipped !== undefined
        ) {
          agenticAssertionPassed = retrievalSkipped === evalCase.expect_retrieval_skipped;
          if (!agenticAssertionPassed) {
            agenticAssertionFailures.push(
              `${evalCase.id}: expected retrieval_skipped=${evalCase.expect_retrieval_skipped}, got ${retrievalSkipped} (pipeline=${pipelineResult.status})`,
            );
          }
        }

        const passed = decisionPass && glPass && agenticAssertionPassed;

        if (evalCase.expected_decision === "AUTO_TAG") {
          autoTagTotal += 1;
          if (passed) {
            autoTagCorrect += 1;
          }
        }

        if (evalCase.vendor_raw.toLowerCase().includes("aws") && actualDecision === "AUTO_TAG") {
          llmCallsSavedByRules += 1;
        }

        if (observability && typeof observability === "object") {
          const usage = parseLlmUsageFromObservability(
            observability as Record<string, unknown>,
          );
          totalCostUsd += usage.costUsd;
          totalPromptTokens += usage.promptTokens;
          totalCompletionTokens += usage.completionTokens;
        }

        const recallEligible = isRetrievalRecallEligible(evalCase) && !retrievalSkipped;
        let neighborGlCodes: string[] = [];
        if (observability) {
          const parsed = parseRetrievalFromObservability(observability);
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
              ? didRetrievalRecallHit(observability, evalCase.expected_gl_code)
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
          retrieval_skipped: retrievalSkipped,
          agentic_assertion_passed: agenticAssertionPassed,
        });

        const status = passed ? "pass" : "FAIL";
        const agenticHint =
          !agenticAssertionPassed && evalCase.requires_agentic_flag
            ? `, retrieval_skipped=${retrievalSkipped}, pipeline=${pipelineResult.status}`
            : "";
        console.log(
          `${actualDecision}${actualGlCode ? ` → ${actualGlCode}` : ""} (${status}, expected ${evalCase.expected_decision}${agenticHint})`,
        );
        }),
      );
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
    agentic_evidence_enabled: env.AGENTIC_EVIDENCE_ENABLED,
    retrieval_skipped_count: retrievalSkippedCount,
    retrieval_skipped_rate: Number((retrievalSkippedCount / cases.length).toFixed(4)),
    verifier_force_review_count: verifierForceReviewCount,
    planner_fallback_count: plannerFallbackCount,
    agentic_assertion_failures: agenticAssertionFailures,
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
  if (env.AGENTIC_EVIDENCE_ENABLED) {
    console.log(
      `  retrieval_skipped: ${summary.retrieval_skipped_count}/${summary.case_count} (${(summary.retrieval_skipped_rate * 100).toFixed(1)}%)`,
    );
    console.log(`  verifier_force_review: ${summary.verifier_force_review_count}`);
    console.log(`  planner_fallback: ${summary.planner_fallback_count}`);
  }
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

  if (agenticAssertionFailures.length > 0) {
    console.error("Agentic eval assertions failed:");
    for (const failure of agenticAssertionFailures) {
      console.error(`  ${failure}`);
    }
    await closeCliResources();
    process.exit(1);
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
