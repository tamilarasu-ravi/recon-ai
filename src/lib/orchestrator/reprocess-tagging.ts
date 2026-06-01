import { and, eq } from "drizzle-orm";

import { evaluateTransactionPolicy } from "@/lib/agents/policy/evaluator";
import { isReceiptRequiredAndNotCleared } from "@/lib/agents/policy/receipt-status";
import { runTaggingAgent } from "@/lib/agents/tagging/run-tagging-agent";
import { appendAuditLog, appendEvent } from "@/lib/audit/writers";
import { loadEnv, newRunId } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import type { TaggingDecision } from "@/lib/orchestrator/gates";

export interface ReprocessTaggingResult {
  runId: string;
  decision: TaggingDecision;
  confidence: number;
  policyOutcome: string;
}

/**
 * Re-runs policy + tagging on an existing transaction (e.g. after receipt cleared).
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

  const policyResult = await evaluateTransactionPolicy(db, tenantId, {
    amount: txn.amount,
    currency: txn.currency,
    mcc: txn.mcc ?? undefined,
  });

  const receiptBlocked = await isReceiptRequiredAndNotCleared(
    db,
    tenantId,
    transactionId,
    policyResult.outcome,
  );

  const taggingResult = await runTaggingAgent(db, env, {
    tenantId,
    transactionId,
    vendorRaw: txn.vendorRaw,
    memo: txn.memo ?? undefined,
    amount: txn.amount,
    currency: txn.currency,
    mcc: txn.mcc ?? undefined,
    receiptRequiredAndNotCleared: receiptBlocked,
  });

  let finalDecision = taggingResult.decision;
  if (finalDecision === "AUTO_TAG" && policyResult.outcome === "FLAG_REVIEW") {
    finalDecision = "QUEUE_REVIEW";
  }

  await appendEvent(db, {
    tenantId,
    eventType: "TransactionRetagged",
    runId,
    payload: {
      transaction_id: transactionId,
      decision: finalDecision,
      policy_version: policyResult.policyVersion,
      receipt_cleared: !receiptBlocked,
    },
  });

  await appendAuditLog(db, {
    tenantId,
    runId,
    agent: "tagging",
    transactionId,
    decision: finalDecision,
    confidence: taggingResult.confidence,
    policyVersion: policyResult.policyVersion,
    observability: {
      reprocess: true,
      receipt_blocked: receiptBlocked,
      steps: taggingResult.steps,
    },
  });

  await db
    .update(transactions)
    .set({
      taggingDecision: finalDecision,
      confidence: String(taggingResult.confidence),
      suggestedGlAccountId: taggingResult.suggestedGlAccountId,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, transactionId));

  return {
    runId,
    decision: finalDecision,
    confidence: taggingResult.confidence,
    policyOutcome: policyResult.outcome,
  };
}
