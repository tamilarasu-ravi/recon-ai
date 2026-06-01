import { and, eq } from "drizzle-orm";

import { runTaggingAgent } from "@/lib/agents/tagging/run-tagging-agent";
import type { DbClient } from "@/lib/db/client";
import { appendAuditLog, appendEvent } from "@/lib/audit/writers";
import { deriveIdempotencyKey, loadEnv, newRunId } from "@/lib/config/env";
import { reviewQueue, transactions } from "@/lib/db/schema";
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

export interface PipelineResult {
  runId: string;
  transactionId: string;
  status: "accepted" | "duplicate";
  decision?: TaggingDecision;
  confidence?: number;
  suggestedGlAccountId?: string | null;
}

/**
 * Runs the full transaction ingest and tagging pipeline for one transaction.
 *
 * @param db - Drizzle database client.
 * @param input - Sanitized transaction ingest payload.
 * @returns Run metadata including tri-state tagging decision.
 * @throws Error when database insert fails unexpectedly.
 */
export async function runTaggingPipeline(
  db: DbClient,
  input: TransactionCreatedInput,
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

  await appendEvent(db, {
    tenantId: input.tenantId,
    eventType: "PolicyEvaluated",
    runId,
    payload: {
      transaction_id: transaction.id,
      policy_version: "v0-stub",
      outcome: "ALLOW",
    },
  });

  const taggingResult = await runTaggingAgent(db, env, {
    tenantId: input.tenantId,
    transactionId: transaction.id,
    vendorRaw: input.vendorRaw,
    memo: input.memo,
    amount: input.amount,
    currency: input.currency,
    mcc: input.mcc,
    receiptRequiredAndNotCleared: false,
  });

  await appendEvent(db, {
    tenantId: input.tenantId,
    eventType: "TransactionTagged",
    runId,
    payload: {
      transaction_id: transaction.id,
      decision: taggingResult.decision,
      confidence: taggingResult.confidence,
      gl_account_id:
        taggingResult.decision === "AUTO_TAG" ? taggingResult.suggestedGlAccountId : undefined,
      reason: taggingResult.reason,
    },
  });

  if (taggingResult.decision === "QUEUE_REVIEW" || taggingResult.decision === "REFUSE") {
    await db.insert(reviewQueue).values({
      tenantId: input.tenantId,
      transactionId: transaction.id,
      reason: taggingResult.reason,
      status: "open",
      runId,
    });
  }

  await appendAuditLog(db, {
    tenantId: input.tenantId,
    runId,
    agent: "tagging",
    transactionId: transaction.id,
    decision: taggingResult.decision,
    confidence: taggingResult.confidence,
    policyVersion: "v0-stub",
    observability: {
      steps: taggingResult.steps,
      llm_skipped: taggingResult.llmSkipped,
      llm_skipped_reason: taggingResult.llmSkippedReason,
      suggested_gl_account_id: taggingResult.suggestedGlAccountId,
      reason: taggingResult.reason,
    },
  });

  await db
    .update(transactions)
    .set({ processingStatus: "completed", updatedAt: new Date() })
    .where(eq(transactions.id, transaction.id));

  return {
    runId,
    transactionId: transaction.id,
    status: "accepted",
    decision: taggingResult.decision,
    confidence: taggingResult.confidence,
    suggestedGlAccountId: taggingResult.suggestedGlAccountId,
  };
}
