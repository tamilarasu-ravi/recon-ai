import { and, eq } from "drizzle-orm";

import type { PolicyOutcome } from "@/lib/agents/policy/types";
import type { DbClient } from "@/lib/db/client";
import { appendEvent } from "@/lib/audit/writers";
import { deriveIdempotencyKey, loadEnv, newRunId } from "@/lib/config/env";
import { transactions } from "@/lib/db/schema";
import type { AutoTagInterruptPayload } from "@/lib/orchestrator/langgraph/invoke-result";
import {
  invokeTaggingGraph,
  resumeTaggingGraph,
} from "@/lib/orchestrator/langgraph/tagging-graph";
import type { TaggingDecision } from "@/lib/orchestrator/gates";

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
 * Maps completed graph state to pipeline API result fields.
 *
 * @param runId - Orchestrator run identifier.
 * @param transactionId - Transaction UUID.
 * @param graphState - Final LangGraph state after invoke or resume.
 * @returns Accepted pipeline result payload.
 * @throws Error when required graph fields are missing.
 */
function toAcceptedPipelineResult(
  runId: string,
  transactionId: string,
  graphState: Awaited<ReturnType<typeof invokeTaggingGraph>>["state"],
): PipelineResult {
  if (!graphState.policyResult || !graphState.taggingResult || !graphState.finalDecision) {
    throw new Error("LangGraph tagging workflow did not produce a final decision");
  }

  return {
    runId,
    transactionId,
    status: "accepted",
    policyOutcome: graphState.policyResult.outcome,
    policyVersion: graphState.policyResult.policyVersion,
    decision: graphState.finalDecision,
    confidence: graphState.taggingResult.confidence,
    suggestedGlAccountId: graphState.taggingResult.suggestedGlAccountId,
  };
}

/**
 * Runs the full transaction ingest and tagging pipeline for one transaction.
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
  const runId = newRunId();
  const env = loadEnv();
  const idempotencyKey = deriveIdempotencyKey(
    input.tenantId,
    input.externalTransactionId,
    input.transactionTimestamp,
  );

  const existingRows = await db
    .select({
      id: transactions.id,
      taggingDecision: transactions.taggingDecision,
      confidence: transactions.confidence,
      suggestedGlAccountId: transactions.suggestedGlAccountId,
    })
    .from(transactions)
    .where(
      and(eq(transactions.tenantId, input.tenantId), eq(transactions.idempotencyKey, idempotencyKey)),
    )
    .limit(1);

  const existing = existingRows[0];

  if (existing) {
    return {
      runId,
      transactionId: existing.id,
      status: "duplicate",
      decision: existing.taggingDecision ?? undefined,
      confidence: existing.confidence ? Number(existing.confidence) : undefined,
      suggestedGlAccountId: existing.suggestedGlAccountId,
    };
  }

  const [transaction] = await db
    .insert(transactions)
    .values({
      tenantId: input.tenantId,
      externalTransactionId: input.externalTransactionId,
      idempotencyKey,
      transactionTimestamp: new Date(input.transactionTimestamp),
      amount: input.amount,
      currency: input.currency,
      vendorRaw: input.vendorRaw,
      memo: input.memo,
      mcc: input.mcc,
      processingStatus: "processing",
    })
    .returning({ id: transactions.id });

  await appendEvent(db, {
    tenantId: input.tenantId,
    eventType: "TransactionCreated",
    runId,
    payload: {
      transaction_id: transaction.id,
      external_transaction_id: input.externalTransactionId,
      vendor_raw: input.vendorRaw,
    },
  });

  const graphResult = await invokeTaggingGraph(
    db,
    env,
    {
      runId,
      tenantId: input.tenantId,
      transactionId: transaction.id,
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
      runId,
      payload: {
        transaction_id: transaction.id,
        interrupt: graphResult.interruptPayload,
      },
    });

    return {
      runId,
      transactionId: transaction.id,
      status: "pending_approval",
      policyOutcome: graphResult.state.policyResult?.outcome,
      policyVersion: graphResult.state.policyResult?.policyVersion,
      decision: "AUTO_TAG",
      confidence: graphResult.state.taggingResult?.confidence,
      suggestedGlAccountId: graphResult.state.taggingResult?.suggestedGlAccountId ?? null,
      interrupt: graphResult.interruptPayload,
    };
  }

  return toAcceptedPipelineResult(runId, transaction.id, graphResult.state);
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
