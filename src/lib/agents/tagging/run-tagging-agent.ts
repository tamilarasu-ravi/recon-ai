import { eq } from "drizzle-orm";

import { lookupGlobalVendorPrior } from "@/lib/config/global-vendor-priors";
import type { AppEnv } from "@/lib/config/env";
import {
  buildDeterministicEmbedding,
  embedAndStoreTransaction,
  buildEmbeddingText,
} from "@/lib/agents/tagging/embed-transaction";
import { lookupVendorRule } from "@/lib/agents/tagging/rule-lookup";
import { buildRetrievalNeighborAuditRows } from "@/lib/agents/tagging/retrieval-audit";
import { countLabeledTransactions, retrieveSimilarTransactions } from "@/lib/agents/tagging/retrieval";
import { suggestTagging } from "@/lib/agents/tagging/suggest";
import { normalizeVendor } from "@/lib/agents/tagging/vendor-normalize";
import { hasMinHistory, scoreConfidence } from "@/lib/confidence/scorer";
import type { DbClient } from "@/lib/db/client";
import { chartOfAccounts, transactions } from "@/lib/db/schema";
import { applyTriStateGate, isGlInCoaAllowList, type TaggingDecision } from "@/lib/orchestrator/gates";
import {
  hasPromptInjectionSignal,
  hasUnknownVendorSignal,
  isReviewOnlyGlCode,
} from "@/lib/orchestrator/safety";
import { createLlmClient } from "@/lib/llm/client";
import { TAGGING_PROMPT_VERSION } from "@/lib/llm/prompts/tagging";

export interface TaggingAgentInput {
  tenantId: string;
  transactionId: string;
  vendorRaw: string;
  memo?: string;
  amount: string;
  currency: string;
  mcc?: string;
  receiptRequiredAndNotCleared?: boolean;
}

export interface StepSpan {
  name: string;
  status: "ok" | "skipped" | "error";
  latency_ms: number;
  detail?: Record<string, unknown>;
}

export interface TaggingAgentResult {
  decision: TaggingDecision;
  confidence: number;
  suggestedGlAccountId: string | null;
  reason: string;
  vendorId: string | null;
  steps: StepSpan[];
  llmSkipped: boolean;
  llmSkippedReason?: string;
  parseFailed: boolean;
}

/**
 * Runs the full tagging agent pipeline for one transaction (rule-first → retrieval → LLM → gate).
 *
 * @param db - Database client.
 * @param env - Validated environment.
 * @param input - Transaction context and policy flags.
 * @returns Tagging decision with audit step spans.
 */
export async function runTaggingAgent(
  db: DbClient,
  env: AppEnv,
  input: TaggingAgentInput,
): Promise<TaggingAgentResult> {
  const steps: StepSpan[] = [];
  const receiptBlocked = input.receiptRequiredAndNotCleared ?? false;

  const normalizeStarted = Date.now();
  const vendorResult = await normalizeVendor(db, input.tenantId, input.vendorRaw);
  steps.push({
    name: "vendor_normalize",
    status: "ok",
    latency_ms: Date.now() - normalizeStarted,
    detail: { vendor_id: vendorResult.vendorId, is_new_vendor: vendorResult.isNewVendor },
  });

  if (vendorResult.vendorId) {
    await db
      .update(transactions)
      .set({ vendorId: vendorResult.vendorId, updatedAt: new Date() })
      .where(eq(transactions.id, input.transactionId));
  }

  const coaRows = await db
    .select({ id: chartOfAccounts.id, glCode: chartOfAccounts.glCode, glName: chartOfAccounts.glName })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.tenantId, input.tenantId));

  const coaSet = new Set(coaRows.map((row) => row.id));

  let ruleHit = false;
  let ruleGlAccountId: string | undefined;
  let ruleTaxCode: string | null = null;

  const ruleStarted = Date.now();
  if (vendorResult.vendorId) {
    const rule = await lookupVendorRule(db, input.tenantId, vendorResult.vendorId);
    if (rule.ruleHit) {
      ruleHit = true;
      ruleGlAccountId = rule.glAccountId;
      ruleTaxCode = rule.taxCode;
    }
  }
  steps.push({
    name: "rule_lookup",
    status: "ok",
    latency_ms: Date.now() - ruleStarted,
    detail: { rule_hit: ruleHit, gl_account_id: ruleGlAccountId },
  });

  const labeledCount = await countLabeledTransactions(db, input.tenantId);
  const tenantHasMinHistory = hasMinHistory(labeledCount);

  let neighbors: Awaited<ReturnType<typeof retrieveSimilarTransactions>> = [];
  const retrievalStarted = Date.now();

  try {
    const queryText = buildEmbeddingText(input.vendorRaw, input.memo, input.mcc);
    const queryEmbedding = env.LLM_ENABLE_LIVE_CALLS
      ? await createLlmClient(env).embedText(queryText)
      : buildDeterministicEmbedding(queryText, env.EMBEDDING_DIMENSIONS);

    neighbors = await retrieveSimilarTransactions(db, input.tenantId, queryEmbedding, 5);

    if (env.LLM_ENABLE_LIVE_CALLS) {
      await embedAndStoreTransaction(
        db,
        env,
        input.tenantId,
        input.transactionId,
        input.vendorRaw,
        input.memo,
        input.mcc,
      );
    }

    const proposedGlFromRetrievalPreview = neighbors[0]?.glAccountId;
    const supportCountPreview = proposedGlFromRetrievalPreview
      ? neighbors.filter((neighbor) => neighbor.glAccountId === proposedGlFromRetrievalPreview).length
      : 0;
    const agreeFracPreview =
      neighbors.length > 0 && proposedGlFromRetrievalPreview
        ? supportCountPreview / neighbors.length
        : 0;
    const neighborAuditRows = await buildRetrievalNeighborAuditRows(db, neighbors, coaRows);

    steps.push({
      name: "retrieval",
      status: "ok",
      latency_ms: Date.now() - retrievalStarted,
      detail: {
        neighbor_count: neighbors.length,
        top1_sim: neighbors[0]?.similarity ?? 0,
        support_count: supportCountPreview,
        agree_frac: agreeFracPreview,
        labeled_corpus_count: labeledCount,
        neighbors: neighborAuditRows,
      },
    });
  } catch {
    steps.push({
      name: "retrieval",
      status: "error",
      latency_ms: Date.now() - retrievalStarted,
      detail: { neighbor_count: 0 },
    });
  }

  const proposedGlFromRule = ruleGlAccountId;
  const top1Sim = neighbors[0]?.similarity ?? 0;
  const proposedGlFromRetrieval = neighbors[0]?.glAccountId;
  const supportCount = proposedGlFromRetrieval
    ? neighbors.filter((n) => n.glAccountId === proposedGlFromRetrieval).length
    : 0;
  const agreeFrac =
    neighbors.length > 0 && proposedGlFromRetrieval
      ? supportCount / neighbors.length
      : 0;

  const globalPriorHint = lookupGlobalVendorPrior(vendorResult.canonicalName);

  const llmStarted = Date.now();
  const canSkipLlm = ruleHit && ruleGlAccountId !== undefined && isGlInCoaAllowList(ruleGlAccountId, coaSet);

  const suggestResult = await suggestTagging(
    env,
    {
      vendorRaw: input.vendorRaw,
      memo: input.memo,
      amount: input.amount,
      currency: input.currency,
      mcc: input.mcc,
      coaEntries: coaRows,
      neighbors,
      ruleGlAccountId,
      globalPriorHint,
    },
    canSkipLlm ? { skipLlm: true, skipReason: "vendor_rule_hit" } : undefined,
  );

  steps.push({
    name: "llm_tagging",
    status: suggestResult.parseStatus === "ok" ? "ok" : "error",
    latency_ms: Date.now() - llmStarted,
    detail: {
      llm_skipped: suggestResult.llmSkipped,
      llm_skipped_reason: suggestResult.llmSkippedReason,
      cost_usd: suggestResult.llmMeta?.costUsd ?? 0,
      prompt_tokens: suggestResult.llmMeta?.promptTokens ?? 0,
      completion_tokens: suggestResult.llmMeta?.completionTokens ?? 0,
      model: suggestResult.llmMeta?.model,
      prompt_version: suggestResult.llmSkipped ? undefined : TAGGING_PROMPT_VERSION,
      error_message: suggestResult.errorMessage,
    },
  });

  const parseFailed = suggestResult.parseStatus === "failed";
  const suggestedGl =
    suggestResult.suggestion?.gl_account_id ?? proposedGlFromRule ?? proposedGlFromRetrieval ?? null;

  const confidenceStarted = Date.now();
  const confidenceResult = scoreConfidence({
    ruleHit,
    top1Sim,
    agreeFrac,
    supportCount,
    hasMinHistory: tenantHasMinHistory,
  });
  steps.push({
    name: "confidence_gate",
    status: "ok",
    latency_ms: Date.now() - confidenceStarted,
    detail: confidenceResult.breakdown,
  });

  const glInCoa = suggestedGl ? isGlInCoaAllowList(suggestedGl, coaSet) : false;
  const suggestedGlCode = suggestedGl ? coaRows.find((row) => row.id === suggestedGl)?.glCode : undefined;

  let gateResult = applyTriStateGate({
    confidence: confidenceResult.confidence,
    ruleHit,
    supportCount,
    top1Sim,
    isNewVendor: vendorResult.isNewVendor,
    glInCoa,
    parseFailed,
    promptInjectionDetected: hasPromptInjectionSignal(input.memo),
    reviewOnlyGl: suggestedGlCode ? isReviewOnlyGlCode(suggestedGlCode) : false,
    receiptRequiredAndNotCleared: receiptBlocked,
    unknownVendorSignal: hasUnknownVendorSignal(input.vendorRaw),
    env,
  });

  if (parseFailed && suggestResult.errorMessage?.includes("no longer available")) {
    gateResult = { decision: "QUEUE_REVIEW", reason: "llm_unavailable" };
  } else if (parseFailed && suggestResult.errorMessage?.startsWith("[GoogleGenerativeAI Error]")) {
    gateResult = { decision: "QUEUE_REVIEW", reason: "llm_unavailable" };
  }

  if (
    vendorResult.isNewVendor &&
    neighbors.length === 0 &&
    !ruleHit &&
    gateResult.decision !== "REFUSE"
  ) {
    gateResult = { decision: "QUEUE_REVIEW", reason: "new_vendor_cold_start" };
  }

  if (suggestResult.errorMessage === "llm_unavailable" && gateResult.decision === "AUTO_TAG") {
    gateResult = { decision: "QUEUE_REVIEW", reason: "llm_unavailable" };
  }

  steps.push({
    name: "tri_state_decision",
    status: "ok",
    latency_ms: 0,
    detail: { decision: gateResult.decision, reason: gateResult.reason },
  });

  await db
    .update(transactions)
    .set({
      suggestedGlAccountId: suggestedGl,
      taggingDecision: gateResult.decision,
      confidence: String(confidenceResult.confidence),
      taxCode: suggestResult.suggestion?.tax_code ?? ruleTaxCode ?? undefined,
      dimensions: suggestResult.suggestion?.dimensions,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, input.transactionId));

  return {
    decision: gateResult.decision,
    confidence: confidenceResult.confidence,
    suggestedGlAccountId: suggestedGl,
    reason: gateResult.reason,
    vendorId: vendorResult.vendorId,
    steps,
    llmSkipped: suggestResult.llmSkipped,
    llmSkippedReason: suggestResult.llmSkippedReason,
    parseFailed,
  };
}
