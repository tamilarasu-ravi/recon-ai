import { eq } from "drizzle-orm";
import { interrupt, type Runtime } from "@langchain/langgraph";

import { evaluateTransactionPolicy } from "@/lib/agents/policy/evaluator";
import { isReceiptRequiredAndNotCleared } from "@/lib/agents/policy/receipt-status";
import { runTaggingAgent } from "@/lib/agents/tagging/run-tagging-agent";
import { appendAuditLog, appendEvent } from "@/lib/audit/writers";
import { sendReceiptChaseIfNeeded } from "@/lib/notifications/receipt-chase";
import { transactions } from "@/lib/db/schema";
import type { TaggingGraphContext } from "@/lib/orchestrator/langgraph/context";
import type { TaggingGraphStateType } from "@/lib/orchestrator/langgraph/tagging-state";
import { traceGraphStep } from "@/lib/orchestrator/langgraph/trace-step";
import type { GraphStepRecord } from "@/lib/orchestrator/langgraph/trace-step";
import { applyPolicyDecisionCap } from "@/lib/orchestrator/policy-cap";
import { syncAutoTagToErp } from "@/lib/integrations/erp/sync-auto-tag";
import { buildTaggingObservability } from "@/lib/observability/llm-cost";
import { syncReviewQueueAfterTagging } from "@/lib/orchestrator/review-queue-sync";
import { emitPipelineTraceStep, type PipelineTraceContext } from "@/lib/pipeline/trace-step";

const EVAL_SKIP_POLICY_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Resolves typed runtime context for tagging graph nodes.
 *
 * @param runtime - LangGraph runtime from node invocation.
 * @returns Validated tagging graph context.
 * @throws Error when db or env is missing from context.
 */
function getTaggingContext(runtime: Runtime<TaggingGraphContext>): TaggingGraphContext {
  const context = runtime.context;
  if (!context?.db || !context?.env) {
    throw new Error("Tagging graph requires db and env in runtime context");
  }
  return context;
}

/**
 * Merges prior graph steps with the current node step for audit observability.
 *
 * @param priorSteps - Steps accumulated in graph state.
 * @param node - Current node name.
 * @param startedAtMs - Node entry timestamp.
 * @returns Full step list including the current node.
 */
function mergeGraphSteps(
  priorSteps: GraphStepRecord[],
  node: string,
  startedAtMs: number,
): GraphStepRecord[] {
  return [...priorSteps, ...traceGraphStep(node, startedAtMs).graphSteps];
}

/**
 * Evaluates tenant policy rules and writes policy audit events.
 *
 * @param state - Current graph state.
 * @param runtime - Runtime context with db and skipPolicy flag.
 * @returns Partial state update with policyResult.
 */
export async function evaluatePolicyNode(
  state: TaggingGraphStateType,
  runtime: Runtime<TaggingGraphContext>,
): Promise<Partial<TaggingGraphStateType>> {
  const started = Date.now();
  const { db, skipPolicy } = getTaggingContext(runtime);
  const traceContext: PipelineTraceContext = {
    tenantId: state.tenantId,
    transactionId: state.transactionId,
    runId: state.runId,
  };

  if (!skipPolicy) {
    await emitPipelineTraceStep(db, traceContext, {
      step_id: "policy-eval-start",
      phase: "policy",
      title: "Policy evaluation",
      description: "Deterministic rule engine — receipt, MCC, caps.",
      status: "running",
    });
  }

  const policyResult = skipPolicy
    ? {
        outcome: "ALLOW" as const,
        policyVersion: "eval-skip",
        policyId: EVAL_SKIP_POLICY_ID,
        matchedRules: [],
      }
    : await evaluateTransactionPolicy(db, state.tenantId, {
        amount: state.amount,
        currency: state.currency,
        mcc: state.mcc,
      });

  if (!skipPolicy) {
    await appendEvent(db, {
      tenantId: state.tenantId,
      eventType: "PolicyEvaluated",
      runId: state.runId,
      payload: {
        transaction_id: state.transactionId,
        policy_version: policyResult.policyVersion,
        outcome: policyResult.outcome,
        matched_rules: policyResult.matchedRules,
      },
    });

    await appendAuditLog(db, {
      tenantId: state.tenantId,
      runId: state.runId,
      agent: "policy",
      transactionId: state.transactionId,
      policyVersion: policyResult.policyVersion,
      observability: {
        outcome: policyResult.outcome,
        matched_rules: policyResult.matchedRules,
        orchestrator: "langgraph",
        node: "evaluatePolicy",
        graph_steps: mergeGraphSteps(state.graphSteps, "evaluatePolicy", started),
      },
    });

    await emitPipelineTraceStep(db, traceContext, {
      step_id: "policy-eval-complete",
      phase: "policy",
      title: "Policy evaluation",
      status: "complete",
      latency_ms: Date.now() - started,
      detail: {
        outcome: policyResult.outcome,
        policy_version: policyResult.policyVersion,
        matched_rules: policyResult.matchedRules,
      },
      description:
        policyResult.outcome === "FLAG_RECEIPT"
          ? "Receipt required before AUTO_TAG can proceed."
          : "Policy outcome recorded on PolicyEvaluated event.",
    });
  }

  return { policyResult, ...traceGraphStep("evaluatePolicy", started) };
}

/**
 * Checks whether receipt policy blocks AUTO_TAG for this transaction.
 *
 * @param state - Current graph state with policyResult.
 * @param runtime - Runtime context with db.
 * @returns Partial state update with receiptBlocked flag.
 */
export async function checkReceiptNode(
  state: TaggingGraphStateType,
  runtime: Runtime<TaggingGraphContext>,
): Promise<Partial<TaggingGraphStateType>> {
  const started = Date.now();
  const { db, skipPolicy } = getTaggingContext(runtime);

  if (!state.policyResult) {
    throw new Error("checkReceiptNode requires policyResult in state");
  }

  const receiptBlocked = skipPolicy
    ? false
    : await isReceiptRequiredAndNotCleared(
        db,
        state.tenantId,
        state.transactionId,
        state.policyResult.outcome,
      );

  if (receiptBlocked) {
    await sendReceiptChaseIfNeeded(db, {
      tenantId: state.tenantId,
      transactionId: state.transactionId,
      runId: state.runId,
      vendorRaw: state.vendorRaw,
      amount: state.amount,
      currency: state.currency,
    });
  }

  await emitPipelineTraceStep(db, {
    tenantId: state.tenantId,
    transactionId: state.transactionId,
    runId: state.runId,
  }, {
    step_id: "receipt-gate",
    phase: "receipt",
    title: "Receipt gate",
    status: receiptBlocked ? "complete" : "skipped",
    latency_ms: Date.now() - started,
    detail: { receipt_blocked: receiptBlocked, policy_outcome: state.policyResult.outcome },
    description: receiptBlocked
      ? "FLAG_RECEIPT without cleared receipt — AUTO_TAG blocked."
      : "No receipt block for this transaction.",
  });

  return { receiptBlocked, ...traceGraphStep("checkReceipt", started) };
}

/**
 * Invokes the tagging agent (rules → retrieval → LLM → gates).
 *
 * @param state - Current graph state.
 * @param runtime - Runtime context with db and env.
 * @returns Partial state update with taggingResult.
 */
export async function runTaggingNode(
  state: TaggingGraphStateType,
  runtime: Runtime<TaggingGraphContext>,
): Promise<Partial<TaggingGraphStateType>> {
  const started = Date.now();
  const { db, env } = getTaggingContext(runtime);

  const taggingResult = await runTaggingAgent(db, env, {
    tenantId: state.tenantId,
    transactionId: state.transactionId,
    vendorRaw: state.vendorRaw,
    memo: state.memo,
    amount: state.amount,
    currency: state.currency,
    mcc: state.mcc,
    receiptRequiredAndNotCleared: state.receiptBlocked,
    trace: {
      tenantId: state.tenantId,
      transactionId: state.transactionId,
      runId: state.runId,
    },
  });

  return { taggingResult, ...traceGraphStep("runTagging", started) };
}

/**
 * Applies policy decision cap and persists decision override on transaction row.
 *
 * @param state - Current graph state with policyResult and taggingResult.
 * @param runtime - Runtime context with db.
 * @returns Partial state update with finalDecision and finalReason.
 */
export async function applyPolicyCapNode(
  state: TaggingGraphStateType,
  runtime: Runtime<TaggingGraphContext>,
): Promise<Partial<TaggingGraphStateType>> {
  const started = Date.now();
  const { db } = getTaggingContext(runtime);

  if (!state.policyResult || !state.taggingResult) {
    throw new Error("applyPolicyCapNode requires policyResult and taggingResult");
  }

  const finalDecision = applyPolicyDecisionCap(
    state.taggingResult.decision,
    state.policyResult.outcome,
  );
  const finalReason =
    finalDecision !== state.taggingResult.decision
      ? "policy_flag_review"
      : state.taggingResult.reason;

  if (finalDecision !== state.taggingResult.decision) {
    await db
      .update(transactions)
      .set({
        taggingDecision: finalDecision,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, state.transactionId));
  }

  return { finalDecision, finalReason, ...traceGraphStep("applyPolicyCap", started) };
}

/**
 * Pauses before AUTO_TAG persist for human approval when HITL is enabled.
 *
 * @param state - Graph state after policy cap with finalDecision.
 * @param runtime - Runtime context with hitlEnabled flag.
 * @returns Partial state; may downgrade to QUEUE_REVIEW when rejected.
 */
export async function awaitAutoTagApprovalNode(
  state: TaggingGraphStateType,
  runtime: Runtime<TaggingGraphContext>,
): Promise<Partial<TaggingGraphStateType>> {
  const started = Date.now();
  const { hitlEnabled } = getTaggingContext(runtime);

  const shouldPause =
    hitlEnabled &&
    state.mode === "ingest" &&
    state.finalDecision === "AUTO_TAG" &&
    state.taggingResult;

  if (!shouldPause || !state.taggingResult) {
    return traceGraphStep("awaitAutoTagApproval", started, "skipped");
  }

  const approved = interrupt({
    type: "auto_tag_approval",
    transaction_id: state.transactionId,
    run_id: state.runId,
    proposed_decision: state.finalDecision,
    confidence: state.taggingResult.confidence,
    vendor_raw: state.vendorRaw,
    amount: state.amount,
    currency: state.currency,
  });

  if (approved !== true) {
    return {
      finalDecision: "QUEUE_REVIEW",
      finalReason: "hitl_auto_tag_rejected",
      ...traceGraphStep("awaitAutoTagApproval", started),
    };
  }

  return traceGraphStep("awaitAutoTagApproval", started);
}

/**
 * Persists ingest workflow outcomes: events, review queue, audit, processing status.
 *
 * @param state - Final graph state after policy cap.
 * @param runtime - Runtime context with db.
 * @returns Partial state update with final graph step trace.
 */
export async function persistIngestOutcomeNode(
  state: TaggingGraphStateType,
  runtime: Runtime<TaggingGraphContext>,
): Promise<Partial<TaggingGraphStateType>> {
  const started = Date.now();
  const { db } = getTaggingContext(runtime);

  if (!state.policyResult || !state.taggingResult || !state.finalDecision || !state.finalReason) {
    throw new Error("persistIngestOutcomeNode requires policy, tagging, and final decision");
  }

  const graphSteps = mergeGraphSteps(state.graphSteps, "persistIngestOutcome", started);

  await appendEvent(db, {
    tenantId: state.tenantId,
    eventType: "TransactionTagged",
    runId: state.runId,
    payload: {
      transaction_id: state.transactionId,
      decision: state.finalDecision,
      confidence: state.taggingResult.confidence,
      gl_account_id:
        state.finalDecision === "AUTO_TAG"
          ? state.taggingResult.suggestedGlAccountId
          : undefined,
      reason: state.finalReason,
      policy_version: state.policyResult.policyVersion,
    },
  });

  await syncReviewQueueAfterTagging(
    db,
    state.tenantId,
    state.transactionId,
    state.finalDecision,
    state.finalReason,
    state.runId,
  );

  await appendAuditLog(db, {
    tenantId: state.tenantId,
    runId: state.runId,
    agent: "tagging",
    transactionId: state.transactionId,
    decision: state.finalDecision,
    confidence: state.taggingResult.confidence,
    policyVersion: state.policyResult.policyVersion,
    observability: buildTaggingObservability(
      {
        orchestrator: "langgraph",
        node: "persistIngestOutcome",
        graph_steps: graphSteps,
        suggested_gl_account_id: state.taggingResult.suggestedGlAccountId,
        reason: state.finalReason,
        receipt_blocked: state.receiptBlocked,
        policy_outcome: state.policyResult.outcome,
      },
      state.taggingResult.steps,
      {
        llmSkipped: state.taggingResult.llmSkipped,
        llmSkippedReason: state.taggingResult.llmSkippedReason,
      },
    ),
  });

  const glAccountId =
    state.finalDecision === "AUTO_TAG" ? state.taggingResult.suggestedGlAccountId : null;

  await db
    .update(transactions)
    .set({
      processingStatus: "completed",
      taggingDecision: state.finalDecision,
      confidence: String(state.taggingResult.confidence),
      suggestedGlAccountId: state.taggingResult.suggestedGlAccountId,
      glAccountId: glAccountId ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, state.transactionId));

  if (state.finalDecision === "AUTO_TAG" && glAccountId) {
    await syncAutoTagToErp(db, {
      tenantId: state.tenantId,
      transactionId: state.transactionId,
      runId: state.runId,
      glAccountId,
    });
  }

  const traceContext: PipelineTraceContext = {
    tenantId: state.tenantId,
    transactionId: state.transactionId,
    runId: state.runId,
  };

  await emitPipelineTraceStep(db, traceContext, {
    step_id: "persist-complete",
    phase: "persist",
    title: "Persist outcome",
    status: "complete",
    latency_ms: Date.now() - started,
    detail: {
      decision: state.finalDecision,
      reason: state.finalReason,
      review_queue_synced: state.finalDecision !== "AUTO_TAG",
    },
    description: "TransactionTagged event, audit log, review queue, and processing status updated.",
  });

  await emitPipelineTraceStep(db, traceContext, {
    step_id: "orchestrator-complete",
    phase: "orchestrator",
    title: "LangGraph orchestrator",
    status: "complete",
    detail: {
      decision: state.finalDecision,
      confidence: state.taggingResult.confidence,
      graph_step_count: graphSteps.length,
    },
  });

  return traceGraphStep("persistIngestOutcome", started);
}

/**
 * Persists reprocess workflow outcomes after receipt cleared or policy change.
 *
 * @param state - Final graph state after policy cap.
 * @param runtime - Runtime context with db.
 * @returns Partial state update with final graph step trace.
 */
export async function persistReprocessOutcomeNode(
  state: TaggingGraphStateType,
  runtime: Runtime<TaggingGraphContext>,
): Promise<Partial<TaggingGraphStateType>> {
  const started = Date.now();
  const { db } = getTaggingContext(runtime);

  if (!state.policyResult || !state.taggingResult || !state.finalDecision) {
    throw new Error("persistReprocessOutcomeNode requires policy, tagging, and final decision");
  }

  const graphSteps = mergeGraphSteps(state.graphSteps, "persistReprocessOutcome", started);

  await appendEvent(db, {
    tenantId: state.tenantId,
    eventType: "TransactionRetagged",
    runId: state.runId,
    payload: {
      transaction_id: state.transactionId,
      decision: state.finalDecision,
      policy_version: state.policyResult.policyVersion,
      receipt_cleared: !state.receiptBlocked,
    },
  });

  await appendAuditLog(db, {
    tenantId: state.tenantId,
    runId: state.runId,
    agent: "tagging",
    transactionId: state.transactionId,
    decision: state.finalDecision,
    confidence: state.taggingResult.confidence,
    policyVersion: state.policyResult.policyVersion,
    observability: buildTaggingObservability(
      {
        orchestrator: "langgraph",
        node: "persistReprocessOutcome",
        graph_steps: graphSteps,
        reprocess: true,
        receipt_blocked: state.receiptBlocked,
        suggested_gl_account_id: state.taggingResult.suggestedGlAccountId,
        reason: state.finalReason,
        policy_outcome: state.policyResult.outcome,
      },
      state.taggingResult.steps,
      {
        llmSkipped: state.taggingResult.llmSkipped,
        llmSkippedReason: state.taggingResult.llmSkippedReason,
      },
    ),
  });

  await syncReviewQueueAfterTagging(
    db,
    state.tenantId,
    state.transactionId,
    state.finalDecision,
    state.finalReason ?? state.taggingResult.reason,
    state.runId,
  );

  const glAccountId =
    state.finalDecision === "AUTO_TAG" ? state.taggingResult.suggestedGlAccountId : null;

  await db
    .update(transactions)
    .set({
      taggingDecision: state.finalDecision,
      confidence: String(state.taggingResult.confidence),
      suggestedGlAccountId: state.taggingResult.suggestedGlAccountId,
      glAccountId: glAccountId ?? undefined,
      processingStatus: "completed",
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, state.transactionId));

  if (state.finalDecision === "AUTO_TAG" && glAccountId) {
    await syncAutoTagToErp(db, {
      tenantId: state.tenantId,
      transactionId: state.transactionId,
      runId: state.runId,
      glAccountId,
    });
  }

  const traceContext: PipelineTraceContext = {
    tenantId: state.tenantId,
    transactionId: state.transactionId,
    runId: state.runId,
  };

  await emitPipelineTraceStep(db, traceContext, {
    step_id: "persist-reprocess-complete",
    phase: "persist",
    title: "Persist reprocess outcome",
    status: "complete",
    latency_ms: Date.now() - started,
    detail: {
      decision: state.finalDecision,
      reason: state.finalReason,
      reprocess: true,
      review_queue_synced: state.finalDecision !== "AUTO_TAG",
    },
    description: "TransactionRetagged event, audit log, and review queue updated after reprocess.",
  });

  await emitPipelineTraceStep(db, traceContext, {
    step_id: "orchestrator-reprocess-complete",
    phase: "orchestrator",
    title: "LangGraph orchestrator",
    status: "complete",
    detail: {
      decision: state.finalDecision,
      confidence: state.taggingResult.confidence,
      reprocess: true,
      graph_step_count: graphSteps.length,
    },
  });

  return traceGraphStep("persistReprocessOutcome", started);
}

/**
 * Routes to ingest or reprocess persist node based on workflow mode in state.
 *
 * @param state - Current graph state with mode flag.
 * @returns Next node name for conditional edge.
 */
export function routePersistNode(
  state: TaggingGraphStateType,
): "persistIngestOutcome" | "persistReprocessOutcome" {
  return state.mode === "reprocess" ? "persistReprocessOutcome" : "persistIngestOutcome";
}
