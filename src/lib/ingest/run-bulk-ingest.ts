import type { DbClient } from "@/lib/db/client";
import type { BulkTransactionRow } from "@/lib/ingest/bulk-transaction-schema";
import {
  queueTransactionIngest,
  runQueuedTransactionInBackground,
} from "@/lib/orchestrator/queue-transaction-ingest";
import { processQueuedTransaction } from "@/lib/orchestrator/process-queued-transaction";
import { loadEnv } from "@/lib/config/env";
import type { TransactionCreatedInput } from "@/lib/orchestrator/run-pipeline";

export interface BulkIngestRowResult {
  externalTransactionId: string;
  transactionId?: string;
  runId?: string;
  status: "queued" | "duplicate" | "failed";
  processingStatus?: string;
  error?: string;
}

export interface BulkIngestSummary {
  accepted: number;
  duplicates: number;
  failed: number;
  results: BulkIngestRowResult[];
}

/**
 * Maps a bulk CSV/API row to orchestrator ingest input.
 *
 * @param tenantId - Tenant UUID.
 * @param row - One bulk row.
 * @returns TransactionCreatedInput for the pipeline.
 */
function toIngestInput(tenantId: string, row: BulkTransactionRow): TransactionCreatedInput {
  return {
    tenantId,
    externalTransactionId: row.external_transaction_id,
    transactionTimestamp: row.transaction_timestamp,
    amount: row.amount,
    currency: row.currency,
    vendorRaw: row.vendor_raw,
    memo: row.memo,
    mcc: row.mcc,
  };
}

/**
 * Queues or synchronously processes multiple transactions for one tenant.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param rows - Parsed bulk rows (max 50).
 * @param options - When async is true, schedules background tagging per row.
 * @returns Per-row outcomes and aggregate counts.
 */
export async function runBulkTransactionIngest(
  db: DbClient,
  tenantId: string,
  rows: BulkTransactionRow[],
  options: { async: boolean },
): Promise<BulkIngestSummary> {
  const results: BulkIngestRowResult[] = [];
  let accepted = 0;
  let duplicates = 0;
  let failed = 0;

  const env = loadEnv();

  for (const row of rows) {
    try {
      const input = toIngestInput(tenantId, row);
      const queued = await queueTransactionIngest(db, input, {
        processingMode: options.async ? "async" : "sync",
      });

      if (queued.status === "duplicate") {
        duplicates += 1;
        results.push({
          externalTransactionId: row.external_transaction_id,
          transactionId: queued.transactionId,
          runId: queued.runId,
          status: "duplicate",
          processingStatus: queued.processingStatus,
        });
        continue;
      }

      accepted += 1;

      if (options.async) {
        void runQueuedTransactionInBackground({
          ...input,
          runId: queued.runId,
          transactionId: queued.transactionId,
        });
      } else {
        await processQueuedTransaction(db, env, {
          ...input,
          runId: queued.runId,
          transactionId: queued.transactionId,
        });
      }

      results.push({
        externalTransactionId: row.external_transaction_id,
        transactionId: queued.transactionId,
        runId: queued.runId,
        status: "queued",
        processingStatus: queued.processingStatus,
      });
    } catch (error) {
      failed += 1;
      results.push({
        externalTransactionId: row.external_transaction_id,
        status: "failed",
        error: error instanceof Error ? error.message : "Bulk row failed",
      });
    }
  }

  return { accepted, duplicates, failed, results };
}
