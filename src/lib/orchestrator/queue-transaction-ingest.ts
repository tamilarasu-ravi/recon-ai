import { and, eq } from "drizzle-orm";

import { appendEvent } from "@/lib/audit/writers";
import { deriveIdempotencyKey, loadEnv, newRunId } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import type { PipelineOptions, PipelineResult, TransactionCreatedInput } from "@/lib/orchestrator/run-pipeline";
import { processQueuedTransaction } from "@/lib/orchestrator/process-queued-transaction";
import { recordProcessingFailure } from "@/lib/orchestrator/processing-failure";
import type { ProcessingStatus } from "@/lib/orchestrator/processing-retry";

export type { ProcessingStatus };

export interface QueueTransactionResult {
  runId: string;
  transactionId: string;
  status: "duplicate" | "queued";
  processingStatus?: ProcessingStatus;
  decision?: PipelineResult["decision"];
  confidence?: number;
  suggestedGlAccountId?: string | null;
}

/**
 * Inserts a new transaction as pending or returns an existing idempotent row.
 *
 * @param db - Database client.
 * @param input - Ingest payload.
 * @returns Queue metadata without running the tagging graph.
 */
export async function queueTransactionIngest(
  db: DbClient,
  input: TransactionCreatedInput,
  options?: { processingMode?: "sync" | "async" },
): Promise<QueueTransactionResult> {
  const runId = newRunId();
  const idempotencyKey = deriveIdempotencyKey(
    input.tenantId,
    input.externalTransactionId,
    input.transactionTimestamp,
  );

  const existingRows = await db
    .select({
      id: transactions.id,
      processingStatus: transactions.processingStatus,
      processingAttemptCount: transactions.processingAttemptCount,
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
      processingStatus: existing.processingStatus as ProcessingStatus,
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
      processingStatus: "pending",
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
      processing_mode: options?.processingMode ?? "sync",
    },
  });

  return {
    runId,
    transactionId: transaction.id,
    status: "queued",
    processingStatus: "pending",
  };
}

/**
 * Runs the tagging graph for a queued transaction inside a background task.
 *
 * @param input - Original ingest payload plus queue ids.
 * @param options - Pipeline options (eval skips policy/HITL).
 */
export async function runQueuedTransactionInBackground(
  input: TransactionCreatedInput & { runId: string; transactionId: string },
  pipelineOptions?: PipelineOptions,
): Promise<void> {
  const { getDb } = await import("@/lib/db/client");
  const db = getDb();
  const env = loadEnv();

  const attemptRows = await db
    .select({ processingAttemptCount: transactions.processingAttemptCount })
    .from(transactions)
    .where(eq(transactions.id, input.transactionId))
    .limit(1);

  const currentAttemptCount = attemptRows[0]?.processingAttemptCount ?? 0;

  try {
    await processQueuedTransaction(db, env, input, pipelineOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tagging pipeline failed";
    await recordProcessingFailure(db, {
      tenantId: input.tenantId,
      transactionId: input.transactionId,
      runId: input.runId,
      errorMessage: message,
      currentAttemptCount,
    });
  }
}
