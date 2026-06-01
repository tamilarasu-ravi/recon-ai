import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { appendAuditLog, appendEvent } from "@/lib/audit/writers";
import { deriveIdempotencyKey, loadEnv, newRunId } from "@/lib/config/env";
import { transactions } from "@/lib/db/schema";
import { createLlmClient } from "@/lib/llm/client";

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
}

/**
 * Runs the tagging pipeline skeleton for a newly ingested transaction.
 * Persists TransactionCreated event and audit trace; full agent logic arrives in Phase B.
 *
 * @param db - Drizzle database client.
 * @param input - Sanitized transaction ingest payload.
 * @returns Run id and transaction id (or duplicate status).
 * @throws Error when database insert fails unexpectedly.
 */
export async function runTaggingPipeline(
  db: DbClient,
  input: TransactionCreatedInput,
): Promise<PipelineResult> {
  const runId = newRunId();
  const idempotencyKey = deriveIdempotencyKey(
    input.tenantId,
    input.externalTransactionId,
    input.transactionTimestamp,
  );

  const existingRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(eq(transactions.tenantId, input.tenantId), eq(transactions.idempotencyKey, idempotencyKey)),
    )
    .limit(1);

  const existing = existingRows[0];

  if (existing) {
    return { runId, transactionId: existing.id, status: "duplicate" };
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

  const env = loadEnv();
  const llm = createLlmClient(env);

  await appendAuditLog(db, {
    tenantId: input.tenantId,
    runId,
    agent: "orchestrator",
    transactionId: transaction.id,
    observability: {
      steps: [
        { name: "ingest", status: "ok", latency_ms: 0 },
        { name: "llm_client_ready", status: "ok", provider: env.LLM_PROVIDER, model: env.LLM_MODEL },
      ],
      llm_client: {
        provider: env.LLM_PROVIDER,
        live_calls_enabled: env.LLM_ENABLE_LIVE_CALLS,
        embed_available: typeof llm.embedText === "function",
      },
    },
  });

  await db
    .update(transactions)
    .set({ processingStatus: "completed", updatedAt: new Date() })
    .where(eq(transactions.id, transaction.id));

  return { runId, transactionId: transaction.id, status: "accepted" };
}
