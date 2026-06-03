import { eq } from "drizzle-orm";

import { appendEvent } from "@/lib/audit/writers";
import type { DbClient } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import {
  computeNextRetryAt,
  getMaxProcessingAttempts,
  type ProcessingStatus,
} from "@/lib/orchestrator/processing-retry";

export interface ProcessingFailureResult {
  status: ProcessingStatus;
  attemptCount: number;
  lastError: string;
  nextRetryAt: string | null;
}

/**
 * Records a pipeline failure and schedules retry or dead-letter when attempts are exhausted.
 *
 * @param db - Database client.
 * @param params - Tenant, transaction, run ids and error message.
 * @returns Updated processing metadata for API responses.
 */
export async function recordProcessingFailure(
  db: DbClient,
  params: {
    tenantId: string;
    transactionId: string;
    runId: string;
    errorMessage: string;
    currentAttemptCount: number;
  },
): Promise<ProcessingFailureResult> {
  const maxAttempts = getMaxProcessingAttempts();
  const nextAttempt = params.currentAttemptCount + 1;
  const lastError = params.errorMessage.slice(0, 2000);

  if (nextAttempt >= maxAttempts) {
    await db
      .update(transactions)
      .set({
        processingStatus: "dead_letter",
        processingAttemptCount: nextAttempt,
        processingLastError: lastError,
        processingNextRetryAt: null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, params.transactionId));

    await appendEvent(db, {
      tenantId: params.tenantId,
      eventType: "TransactionProcessingDeadLetter",
      runId: params.runId,
      payload: {
        transaction_id: params.transactionId,
        attempt_count: nextAttempt,
        error: lastError,
      },
    });

    return {
      status: "dead_letter",
      attemptCount: nextAttempt,
      lastError,
      nextRetryAt: null,
    };
  }

  const nextRetryAt = computeNextRetryAt(nextAttempt);

  await db
    .update(transactions)
    .set({
      processingStatus: "pending",
      processingAttemptCount: nextAttempt,
      processingLastError: lastError,
      processingNextRetryAt: nextRetryAt,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, params.transactionId));

  await appendEvent(db, {
    tenantId: params.tenantId,
    eventType: "TransactionProcessingFailed",
    runId: params.runId,
    payload: {
      transaction_id: params.transactionId,
      attempt_count: nextAttempt,
      error: lastError,
      next_retry_at: nextRetryAt.toISOString(),
    },
  });

  return {
    status: "pending",
    attemptCount: nextAttempt,
    lastError,
    nextRetryAt: nextRetryAt.toISOString(),
  };
}

/**
 * Resets a failed or dead-letter transaction for manual or automatic reprocessing.
 *
 * @param db - Database client.
 * @param transactionId - Transaction UUID.
 * @param options - When immediate is true, clears next_retry_at so the worker picks it up now.
 * @returns Whether a row was updated.
 */
export async function resetTransactionForReprocess(
  db: DbClient,
  transactionId: string,
  options?: { immediate?: boolean },
): Promise<boolean> {
  const nextRetryAt = options?.immediate ? null : computeNextRetryAt(0);

  const updated = await db
    .update(transactions)
    .set({
      processingStatus: "pending",
      processingAttemptCount: 0,
      processingLastError: null,
      processingNextRetryAt: nextRetryAt,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, transactionId))
    .returning({ id: transactions.id });

  return updated.length > 0;
}
