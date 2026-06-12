import { eq } from "drizzle-orm";

import { lookupGlobalVendorPrior } from "@/lib/config/global-vendor-priors";
import type { AppEnv } from "@/lib/config/env";
import {
  buildDeterministicEmbedding,
  embedAndStoreTransaction,
  buildEmbeddingText,
} from "@/lib/agents/tagging/embed-transaction";
import { lookupVendorRule } from "@/lib/agents/tagging/rule-lookup";
import { resolveRetrievalPolicy } from "@/lib/agents/tagging/evidence-policy";
import {
  applyVerifierToGate,
  verifyEvidence,
  type VerifierResult,
} from "@/lib/agents/tagging/evidence-verifier";
import { buildRetrievalNeighborAuditRows } from "@/lib/agents/tagging/retrieval-audit";
import { countLabeledTransactions, retrieveSimilarTransactions } from "@/lib/agents/tagging/retrieval";
import { suggestTagging } from "@/lib/agents/tagging/suggest";
import { normalizeVendor } from "@/lib/agents/tagging/vendor-normalize";
import { hasMinHistory, scoreConfidence } from "@/lib/confidence/scorer";
import type { DbClient } from "@/lib/db/client";
import { chartOfAccounts, transactions } from "@/lib/db/schema";
import { applyTriStateGate, isGlInCoaAllowList, type TaggingDecision } from "@/lib/orchestrator/gates";
import {
  emitPipelineTraceStep,
  type PipelineTraceContext,
} from "@/lib/pipeline/trace-step";
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
  /** When set, emits PipelineTraceStep events for live ingest UI. */
  trace?: PipelineTraceContext;
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
  const trace = input.trace;

  /**
   * Writes a pipeline trace step when trace context is configured.
   *
   * @param stepId - Unique step id within the run.
   * @param phase - Workflow phase for UI grouping.
   * @param title - Short label shown in the timeline.
   * @param status - Running, complete, error, or skipped.
   * @param detail - Optional structured metadata for the UI.
   * @param latencyMs - Optional step duration.
   * @param description - Optional longer explanation.
   */
  async function traceEmit(
    stepId: string,
    phase: Parameters<typeof emitPipelineTraceStep>[2]["phase"],
    title: string,
    status: Parameters<typeof emitPipelineTraceStep>[2]["status"],
    detail?: Record<string, unknown>,
    latencyMs?: number,
    description?: string,
  ): Promise<void> {
    if (!trace) {
      return;
    }
    await emitPipelineTraceStep(db, trace, {
      step_id: stepId,
      phase,
      title,
      description,
      status,
      latency_ms: latencyMs,
      detail,
    });
  }

  const normalizeStarted = Date.now();
  const vendorResult = await normalizeVendor(db, input.tenantId, input.vendorRaw);
  steps.push({
    name: "vendor_normalize",
    status: "ok",
    latency_ms: Date.now() - normalizeStarted,
    detail: { vendor_id: vendorResult.vendorId, is_new_vendor: vendorResult.isNewVendor },
  });
  await traceEmit(
    "vendor-normalize",
    "normalize",
    "Vendor normalization",
    "complete",
    {
      vendor_id: vendorResult.vendorId,
      canonical_name: vendorResult.canonicalName,
      is_new_vendor: vendorResult.isNewVendor,
    },
    Date.now() - normalizeStarted,
    "Alias lookup maps raw vendor string to canonical vendor_id.",
  );

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
  await traceEmit(
    "rule-lookup",
    "rules",
    "Vendor rule lookup",
    ruleHit ? "complete" : "skipped",
    { rule_hit: ruleHit, gl_account_id: ruleGlAccountId },
    Date.now() - ruleStarted,
    ruleHit
      ? "Seeded vendor rule matched — may skip LLM call."
      : "No vendor rule — LLM or retrieval will suggest GL.",
  );

  const labeledCount = await countLabeledTransactions(db, input.tenantId);
  const tenantHasMinHistory = hasMinHistory(labeledCount);

  const retrievalPolicy = resolveRetrievalPolicy({
    ruleHit,
    ruleGlAccountId,
    isNewVendor: vendorResult.isNewVendor,
    coaAllowList: coaSet,
    agenticEnabled: env.AGENTIC_EVIDENCE_ENABLED,
  });

  let neighbors: Awaited<ReturnType<typeof retrieveSimilarTransactions>> = [];
  const retrievalStarted = Date.now();

  if (!retrievalPolicy.shouldRetrieve) {
    steps.push({
      name: "retrieval",
      status: "skipped",
      latency_ms: Date.now() - retrievalStarted,
      detail: {
        neighbor_count: 0,
        skip_reason: retrievalPolicy.skipReason,
        labeled_corpus_count: labeledCount,
      },
    });
    await traceEmit(
      "rag-retrieval-skipped",
      "rag",
      "RAG retrieval",
      "skipped",
      {
        skip_reason: retrievalPolicy.skipReason,
        rule_hit: ruleHit,
        gl_account_id: ruleGlAccountId,
        labeled_corpus_count: labeledCount,
      },
      Date.now() - retrievalStarted,
      "Vendor rule sufficient — embedding and similarity search skipped (agentic evidence).",
    );
  } else {
  try {
    const queryText = buildEmbeddingText(input.vendorRaw, input.memo, input.mcc);

    await traceEmit(
      "embedding-start",
      "embedding",
      "Vector embedding",
      "running",
      {
        chunk_text: queryText,
        embedding_model: env.EMBEDDING_MODEL,
        dimensions: env.EMBEDDING_DIMENSIONS,
        storage: "transaction_embeddings (pgvector)",
      },
      undefined,
      "Single document chunk: vendor | memo | mcc — embedded for similarity search.",
    );

    const queryEmbedding = env.LLM_ENABLE_LIVE_CALLS
      ? await createLlmClient(env).embedText(queryText)
      : buildDeterministicEmbedding(queryText, env.EMBEDDING_DIMENSIONS);

    let storedInVectorDb = false;
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
      storedInVectorDb = true;
    }

    await traceEmit(
      "embedding-complete",
      "embedding",
      "Vector embedding",
      "complete",
      {
        chunk_text: queryText,
        embedding_model: env.EMBEDDING_MODEL,
        dimensions: queryEmbedding.length,
        stored_in_pgvector: storedInVectorDb,
        live_api: env.LLM_ENABLE_LIVE_CALLS,
      },
      undefined,
      storedInVectorDb
        ? "Embedding upserted to transaction_embeddings for future retrieval."
        : "Deterministic embedding used (LLM_ENABLE_LIVE_CALLS=false).",
    );

    await traceEmit(
      "rag-retrieval-start",
      "rag",
      "RAG retrieval",
      "running",
      { top_k: 5, labeled_corpus_count: labeledCount },
      undefined,
      "Cosine similarity search over tenant-scoped labeled transactions.",
    );

    neighbors = await retrieveSimilarTransactions(db, input.tenantId, queryEmbedding, 5);

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
    await traceEmit(
      "rag-retrieval-complete",
      "rag",
      "RAG retrieval",
      "complete",
      {
        neighbor_count: neighbors.length,
        top1_similarity: neighbors[0]?.similarity ?? 0,
        support_count: supportCountPreview,
        agree_frac: agreeFracPreview,
        labeled_corpus_count: labeledCount,
        neighbors: neighborAuditRows,
      },
      Date.now() - retrievalStarted,
      "Top-k neighbors inform confidence and LLM context.",
    );
  } catch {
    steps.push({
      name: "retrieval",
      status: "error",
      latency_ms: Date.now() - retrievalStarted,
      detail: { neighbor_count: 0 },
    });
    await traceEmit(
      "rag-retrieval-error",
      "rag",
      "RAG retrieval",
      "error",
      { neighbor_count: 0 },
      Date.now() - retrievalStarted,
    );
  }
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

  await traceEmit(
    "llm-tagging-start",
    "llm",
    "LLM structured tagging",
    "running",
    {
      llm_skipped: canSkipLlm,
      skip_reason: canSkipLlm ? "vendor_rule_hit" : undefined,
      prompt_version: TAGGING_PROMPT_VERSION,
      neighbor_count: neighbors.length,
    },
    undefined,
    canSkipLlm
      ? "Rule-first path — LLM call skipped."
      : "Structured JSON suggestion with CoA allow-list and RAG neighbors in context.",
  );

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
  await traceEmit(
    "llm-tagging-complete",
    "llm",
    suggestResult.llmSkipped ? "LLM skipped (rule-first)" : "LLM structured tagging",
    suggestResult.parseStatus === "ok" ? "complete" : "error",
    {
      llm_skipped: suggestResult.llmSkipped,
      llm_skipped_reason: suggestResult.llmSkippedReason,
      cost_usd: suggestResult.llmMeta?.costUsd ?? 0,
      prompt_tokens: suggestResult.llmMeta?.promptTokens ?? 0,
      completion_tokens: suggestResult.llmMeta?.completionTokens ?? 0,
      total_tokens:
        (suggestResult.llmMeta?.promptTokens ?? 0) +
        (suggestResult.llmMeta?.completionTokens ?? 0),
      model: suggestResult.llmMeta?.model,
      prompt_version: suggestResult.llmSkipped ? undefined : TAGGING_PROMPT_VERSION,
      suggested_gl_account_id: suggestResult.suggestion?.gl_account_id,
      error_message: suggestResult.errorMessage,
    },
    Date.now() - llmStarted,
  );

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

  const retrievalSkipped = !retrievalPolicy.shouldRetrieve;
  let finalConfidence = confidenceResult.confidence;
  let verifierResult: VerifierResult = {
    confidenceAdjustment: 0,
    forceReview: false,
    concerns: [],
  };

  if (env.AGENTIC_EVIDENCE_ENABLED) {
    verifierResult = verifyEvidence({
      ruleHit,
      ruleGlAccountId: ruleGlAccountId ?? null,
      llmSuggestedGl: suggestResult.suggestion?.gl_account_id ?? null,
      retrievalSkipped,
      isNewVendor: vendorResult.isNewVendor,
      neighborCount: neighbors.length,
      supportCount,
      confidence: confidenceResult.confidence,
      env,
    });
    await traceEmit(
      "evidence-verify",
      "verifier",
      "Evidence verification",
      "complete",
      {
        concerns: verifierResult.concerns,
        force_review: verifierResult.forceReview,
        confidence_adjustment: verifierResult.confidenceAdjustment,
        reason: verifierResult.reason,
      },
      Date.now() - confidenceStarted,
      "Heuristic checks before tri-state gate.",
    );
  }

  steps.push({
    name: "confidence_gate",
    status: "ok",
    latency_ms: Date.now() - confidenceStarted,
    detail: {
      ...confidenceResult.breakdown,
      ...(env.AGENTIC_EVIDENCE_ENABLED
        ? {
            verifier_concerns: verifierResult.concerns,
            verifier_force_review: verifierResult.forceReview,
          }
        : {}),
    },
  });
  await traceEmit(
    "confidence-gate",
    "confidence",
    "Confidence scoring",
    "complete",
    {
      ...(confidenceResult.breakdown as Record<string, unknown>),
      confidence_before_verifier: confidenceResult.confidence,
    },
    Date.now() - confidenceStarted,
    "Deterministic score from rules, retrieval agreement, and history.",
  );

  const glInCoa = suggestedGl ? isGlInCoaAllowList(suggestedGl, coaSet) : false;
  const suggestedGlCode = suggestedGl ? coaRows.find((row) => row.id === suggestedGl)?.glCode : undefined;

  const adjustedConfidence = env.AGENTIC_EVIDENCE_ENABLED
    ? Math.max(
        0,
        Math.min(1, confidenceResult.confidence + verifierResult.confidenceAdjustment),
      )
    : confidenceResult.confidence;

  let gateResult = applyTriStateGate({
    confidence: adjustedConfidence,
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

  if (env.AGENTIC_EVIDENCE_ENABLED) {
    const applied = applyVerifierToGate(
      adjustedConfidence,
      gateResult.decision,
      gateResult.reason,
      verifierResult,
    );
    gateResult = { decision: applied.decision, reason: applied.reason };
    finalConfidence = applied.confidence;
  } else {
    finalConfidence = confidenceResult.confidence;
  }

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
  await traceEmit(
    "tri-state-decision",
    "decision",
    "Tri-state decision",
    "complete",
    {
      decision: gateResult.decision,
      reason: gateResult.reason,
      confidence: finalConfidence,
    },
    undefined,
    "AUTO_TAG, QUEUE_REVIEW, or REFUSE based on confidence, policy, and safety gates.",
  );

  await db
    .update(transactions)
    .set({
      suggestedGlAccountId: suggestedGl,
      taggingDecision: gateResult.decision,
      confidence: String(finalConfidence),
      taxCode: suggestResult.suggestion?.tax_code ?? ruleTaxCode ?? undefined,
      dimensions: suggestResult.suggestion?.dimensions,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, input.transactionId));

  return {
    decision: gateResult.decision,
    confidence: finalConfidence,
    suggestedGlAccountId: suggestedGl,
    reason: gateResult.reason,
    vendorId: vendorResult.vendorId,
    steps,
    llmSkipped: suggestResult.llmSkipped,
    llmSkippedReason: suggestResult.llmSkippedReason,
    parseFailed,
  };
}
