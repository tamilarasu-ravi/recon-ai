import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";

import { loadEnv, newRunId } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { recordProcessingFailure } from "@/lib/orchestrator/processing-failure";
import { processQueuedTransaction } from "@/lib/orchestrator/process-queued-transaction";
import { PROCESSING_STALE_MS } from "@/lib/orchestrator/processing-retry";
import type { TransactionCreatedInput } from "@/lib/orchestrator/run-pipeline";

const DEFAULT_BATCH_SIZE = 10;

export interface DrainPendingTransactionsResult {
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
  errors: string[];
}

/**
 * Loads ingest fields required to re-run the tagging pipeline for a queued row.
 *
 * @param row - Transaction columns from the drain claim.
 * @returns Input for processQueuedTransaction.
 */
function toQueuedInput(row: {
  id: string;
  tenantId: string;
  externalTransactionId: string;
  transactionTimestamp: Date;
  amount: string;
  currency: string;
  vendorRaw: string;
  memo: string | null;
  mcc: string | null;
}): TransactionCreatedInput & { runId: string; transactionId: string } {
  return {
    runId: newRunId(),
    transactionId: row.id,
    tenantId: row.tenantId,
    externalTransactionId: row.externalTransactionId,
    transactionTimestamp: row.transactionTimestamp.toISOString(),
    amount: row.amount,
    currency: row.currency,
    vendorRaw: row.vendorRaw,
    memo: row.memo ?? undefined,
    mcc: row.mcc ?? undefined,
  };
}

/**
 * Claims and processes pending transactions whose retry window has elapsed, plus stale processing rows.
 *
 * @param db - Database client.
 * @param options - Optional batch size override for cron/worker calls.
 * @returns Aggregate drain statistics.
 */
export async function drainPendingTransactions(
  db: DbClient,
  options?: { batchSize?: number },
): Promise<DrainPendingTransactionsResult> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_STALE_MS);
  const env = loadEnv();

  const result: DrainPendingTransactionsResult = {
    claimed: 0,
    completed: 0,
    retried: 0,
    deadLettered: 0,
    errors: [],
  };

  const candidates = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      or(
        and(
          eq(transactions.processingStatus, "pending"),
          or(
            isNull(transactions.processingNextRetryAt),
            lte(transactions.processingNextRetryAt, now),
          ),
        ),
        and(
          eq(transactions.processingStatus, "processing"),
          lte(transactions.updatedAt, staleBefore),
        ),
      ),
    )
    .limit(batchSize);

  if (candidates.length === 0) {
    return result;
  }

  const candidateIds = candidates.map((row) => row.id);

  const claimed = await db
    .update(transactions)
    .set({ processingStatus: "processing", updatedAt: now })
    .where(
      and(
        inArray(transactions.id, candidateIds),
        or(
          and(
            eq(transactions.processingStatus, "pending"),
            or(
              isNull(transactions.processingNextRetryAt),
              lte(transactions.processingNextRetryAt, now),
            ),
          ),
          and(
            eq(transactions.processingStatus, "processing"),
            lte(transactions.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning({
      id: transactions.id,
      tenantId: transactions.tenantId,
      externalTransactionId: transactions.externalTransactionId,
      transactionTimestamp: transactions.transactionTimestamp,
      amount: transactions.amount,
      currency: transactions.currency,
      vendorRaw: transactions.vendorRaw,
      memo: transactions.memo,
      mcc: transactions.mcc,
      processingAttemptCount: transactions.processingAttemptCount,
    });

  result.claimed = claimed.length;

  for (const row of claimed) {
    const input = toQueuedInput({
      ...row,
      amount: String(row.amount),
    });

    try {
      await processQueuedTransaction(db, env, input);
      result.completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tagging pipeline failed";
      const failure = await recordProcessingFailure(db, {
        tenantId: row.tenantId,
        transactionId: row.id,
        runId: input.runId,
        errorMessage: message,
        currentAttemptCount: row.processingAttemptCount,
      });

      if (failure.status === "dead_letter") {
        result.deadLettered += 1;
      } else {
        result.retried += 1;
      }

      result.errors.push(`${row.id}: ${message}`);
    }
  }

  return result;
}
