import { and, eq } from "drizzle-orm";

import { loadEnv, newRunId } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { invokeTaggingGraph } from "@/lib/orchestrator/langgraph/tagging-graph";
import type { TaggingDecision } from "@/lib/orchestrator/gates";

export interface ReprocessTaggingResult {
  runId: string;
  decision: TaggingDecision;
  confidence: number;
  policyOutcome: string;
  reason: string;
}

/**
 * Re-runs policy + tagging on an existing transaction via LangGraph (e.g. after receipt cleared).
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param transactionId - Transaction UUID.
 * @returns Updated tagging decision and confidence.
 * @throws Error when transaction is not found.
 */
export async function reprocessTransactionTagging(
  db: DbClient,
  tenantId: string,
  transactionId: string,
): Promise<ReprocessTaggingResult> {
  const runId = newRunId();
  const env = loadEnv();

  const txnRows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)))
    .limit(1);

  const txn = txnRows[0];
  if (!txn) {
    throw new Error("Transaction not found for tenant");
  }

  const graphResult = await invokeTaggingGraph(
    db,
    env,
    {
      runId,
      tenantId,
      transactionId,
      vendorRaw: txn.vendorRaw,
      memo: txn.memo ?? undefined,
      amount: txn.amount,
      currency: txn.currency,
      mcc: txn.mcc ?? undefined,
    },
    { mode: "reprocess", skipHitl: true },
  );

  if (graphResult.interrupted) {
    throw new Error("Reprocess workflow should not interrupt for HITL");
  }

  const graphState = graphResult.state;
  if (!graphState.policyResult || !graphState.taggingResult || !graphState.finalDecision) {
    throw new Error("LangGraph reprocess workflow did not produce a final decision");
  }

  return {
    runId,
    decision: graphState.finalDecision,
    confidence: graphState.taggingResult.confidence,
    policyOutcome: graphState.policyResult.outcome,
    reason: graphState.finalReason ?? graphState.taggingResult.reason,
  };
}
