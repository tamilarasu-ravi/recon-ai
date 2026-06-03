import { and, eq } from "drizzle-orm";

import type { PolicyOutcome } from "@/lib/agents/policy/types";
import type { DbClient } from "@/lib/db/client";
import { appendEvent } from "@/lib/audit/writers";
import { loadEnv, newRunId } from "@/lib/config/env";
import { transactions } from "@/lib/db/schema";
import type { AutoTagInterruptPayload } from "@/lib/orchestrator/langgraph/invoke-result";
import { resumeTaggingGraph } from "@/lib/orchestrator/langgraph/tagging-graph";
import type { TaggingDecision } from "@/lib/orchestrator/gates";
import { processQueuedTransaction } from "@/lib/orchestrator/process-queued-transaction";
import { queueTransactionIngest } from "@/lib/orchestrator/queue-transaction-ingest";
import type { ProcessingStatus } from "@/lib/orchestrator/processing-retry";
import { toAcceptedPipelineResult } from "@/lib/orchestrator/run-pipeline-result";

export interface TransactionCreatedInput {
  tenantId: string;
  externalTransactionId: string;
  transactionTimestamp: string;
  amount: string;
  currency: string;
  vendorRaw: string;
  memo?: string;
  mcc?: string;
}

export interface PipelineOptions {
  /** When true, skips policy evaluation (tagging eval harness only). */
  skipPolicy?: boolean;
  /** When true, skips AUTO_TAG HITL interrupt (eval, demo batch runs). */
  skipHitl?: boolean;
  /** Override env AUTO_TAG_HITL_ENABLED for this invocation. */
  hitlEnabled?: boolean;
}

export interface PipelineResult {
  runId: string;
  transactionId: string;
  status: "accepted" | "duplicate" | "pending_approval";
  processingStatus?: ProcessingStatus;
  policyOutcome?: PolicyOutcome;
  policyVersion?: string;
  decision?: TaggingDecision;
  confidence?: number;
  suggestedGlAccountId?: string | null;
  interrupt?: AutoTagInterruptPayload;
}

export interface ResumeAutoTagResult {
  runId: string;
  transactionId: string;
  status: "accepted" | "pending_approval";
  decision: TaggingDecision;
  confidence: number;
  policyOutcome: PolicyOutcome;
  policyVersion: string;
  suggestedGlAccountId: string | null;
}

/**
 * Runs the full transaction ingest and tagging pipeline for one transaction (synchronous).
 * Idempotency and ingest are handled here; policy → tagging runs via LangGraph.
 *
 * @param db - Drizzle database client.
 * @param input - Sanitized transaction ingest payload.
 * @returns Run metadata including policy and tri-state tagging decision.
 * @throws Error when database insert fails unexpectedly.
 */
export async function runTaggingPipeline(
  db: DbClient,
  input: TransactionCreatedInput,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const queued = await queueTransactionIngest(db, input, { processingMode: "sync" });

  if (queued.status === "duplicate") {
    return {
      runId: queued.runId,
      transactionId: queued.transactionId,
      status: "duplicate",
      processingStatus: queued.processingStatus,
      decision: queued.decision,
      confidence: queued.confidence,
      suggestedGlAccountId: queued.suggestedGlAccountId,
    };
  }

  const env = loadEnv();
  return processQueuedTransaction(
    db,
    env,
    {
      ...input,
      runId: queued.runId,
      transactionId: queued.transactionId,
    },
    options,
  );
}

/**
 * Resumes a paused AUTO_TAG workflow after human approval or rejection.
 *
 * @param db - Drizzle database client.
 * @param tenantId - Tenant UUID.
 * @param transactionId - Transaction UUID.
 * @param runId - LangGraph thread_id from pending_approval response.
 * @param approved - True to post AUTO_TAG; false to queue for review.
 * @returns Final tagging decision after graph resume.
 * @throws Error when transaction is not found or graph resume fails.
 */
export async function resumeAutoTagApproval(
  db: DbClient,
  tenantId: string,
  transactionId: string,
  runId: string,
  approved: boolean,
): Promise<ResumeAutoTagResult> {
  const env = loadEnv();

  const txnRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)))
    .limit(1);

  if (!txnRows[0]) {
    throw new Error("Transaction not found for tenant");
  }

  const graphResult = await resumeTaggingGraph(db, env, runId, approved, {
    hitlEnabled: env.AUTO_TAG_HITL_ENABLED,
    mode: "ingest",
  });

  if (graphResult.interrupted) {
    throw new Error("Graph still interrupted after resume — unexpected state");
  }

  const accepted = toAcceptedPipelineResult(runId, transactionId, graphResult.state);

  if (accepted.status !== "accepted" || !accepted.decision) {
    throw new Error("Resume did not produce an accepted pipeline result");
  }

  await appendEvent(db, {
    tenantId,
    eventType: approved ? "AutoTagApproved" : "AutoTagRejected",
    runId,
    payload: {
      transaction_id: transactionId,
      approved,
      decision: accepted.decision,
    },
  });

  return {
    runId,
    transactionId,
    status: "accepted",
    decision: accepted.decision,
    confidence: accepted.confidence ?? 0,
    policyOutcome: accepted.policyOutcome ?? "ALLOW",
    policyVersion: accepted.policyVersion ?? "unknown",
    suggestedGlAccountId: accepted.suggestedGlAccountId ?? null,
  };
}
