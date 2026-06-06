import { eq } from "drizzle-orm";

import { appendEvent } from "@/lib/audit/writers";
import type { AppEnv } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { invokeTaggingGraph } from "@/lib/orchestrator/langgraph/tagging-graph";
import { emitPipelineTraceStep } from "@/lib/pipeline/trace-step";
import type { PipelineOptions, PipelineResult, TransactionCreatedInput } from "@/lib/orchestrator/run-pipeline";
import { toAcceptedPipelineResult } from "@/lib/orchestrator/run-pipeline-result";

/**
 * Marks a pending transaction as processing and runs the LangGraph tagging workflow.
 *
 * @param db - Database client.
 * @param env - Application environment.
 * @param input - Ingest fields plus run and transaction ids from the queue step.
 * @param options - Optional eval/demo pipeline flags.
 * @returns Final pipeline result (accepted or pending HITL approval).
 * @throws Error when the graph fails or an unexpected interrupt occurs.
 */
export async function processQueuedTransaction(
  db: DbClient,
  env: AppEnv,
  input: TransactionCreatedInput & { runId: string; transactionId: string },
  options?: PipelineOptions,
): Promise<PipelineResult> {
  await db
    .update(transactions)
    .set({ processingStatus: "processing", updatedAt: new Date() })
    .where(eq(transactions.id, input.transactionId));

  await emitPipelineTraceStep(db, {
    tenantId: input.tenantId,
    transactionId: input.transactionId,
    runId: input.runId,
  }, {
    step_id: "orchestrator-start",
    phase: "orchestrator",
    title: "LangGraph orchestrator",
    description: "Policy → receipt gate → tagging agent → persist.",
    status: "running",
  });

  const graphResult = await invokeTaggingGraph(
    db,
    env,
    {
      runId: input.runId,
      tenantId: input.tenantId,
      transactionId: input.transactionId,
      vendorRaw: input.vendorRaw,
      memo: input.memo,
      amount: input.amount,
      currency: input.currency,
      mcc: input.mcc,
    },
    {
      skipPolicy: options?.skipPolicy,
      skipHitl: options?.skipHitl,
      hitlEnabled: options?.hitlEnabled,
      mode: "ingest",
    },
  );

  if (graphResult.interrupted && graphResult.interruptPayload) {
    await appendEvent(db, {
      tenantId: input.tenantId,
      eventType: "AutoTagPendingApproval",
      runId: input.runId,
      payload: {
        transaction_id: input.transactionId,
        interrupt: graphResult.interruptPayload,
      },
    });

    await db
      .update(transactions)
      .set({ processingStatus: "completed", updatedAt: new Date() })
      .where(eq(transactions.id, input.transactionId));

    return {
      runId: input.runId,
      transactionId: input.transactionId,
      status: "pending_approval",
      policyOutcome: graphResult.state.policyResult?.outcome,
      policyVersion: graphResult.state.policyResult?.policyVersion,
      decision: "AUTO_TAG",
      confidence: graphResult.state.taggingResult?.confidence,
      suggestedGlAccountId: graphResult.state.taggingResult?.suggestedGlAccountId ?? null,
      interrupt: graphResult.interruptPayload,
    };
  }

  return toAcceptedPipelineResult(input.runId, input.transactionId, graphResult.state);
}
