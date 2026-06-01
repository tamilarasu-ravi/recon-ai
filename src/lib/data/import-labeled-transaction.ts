import { eq } from "drizzle-orm";

import {
  buildDeterministicEmbedding,
  buildEmbeddingText,
  embedAndStoreTransaction,
} from "@/lib/agents/tagging/embed-transaction";
import type { AppEnv } from "@/lib/config/env";
import { hasProviderApiKey } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";
import { chartOfAccounts, transactionEmbeddings, transactions } from "@/lib/db/schema";

export interface ImportLabeledTransactionInput {
  tenantId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  vendorRaw: string;
  memo?: string;
  amount: string;
  currency: string;
  glCode: string;
  transactionTimestamp: Date;
}

/**
 * Inserts one labeled transaction and embedding for retrieval corpus (idempotent by external id).
 *
 * @param db - Database client.
 * @param env - App environment for embedding mode.
 * @param coaByCode - Map of gl_code → account id for tenant.
 * @param input - Transaction fields and target GL code.
 * @returns true when inserted, false when already present.
 */
export async function importLabeledTransaction(
  db: DbClient,
  env: AppEnv,
  coaByCode: Map<string, string>,
  input: ImportLabeledTransactionInput,
): Promise<boolean> {
  const glId = coaByCode.get(input.glCode);
  if (!glId) {
    return false;
  }

  const existing = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.externalTransactionId, input.externalTransactionId))
    .limit(1);

  if (existing[0]) {
    return false;
  }

  const [inserted] = await db
    .insert(transactions)
    .values({
      tenantId: input.tenantId,
      externalTransactionId: input.externalTransactionId,
      idempotencyKey: input.idempotencyKey,
      transactionTimestamp: input.transactionTimestamp,
      amount: input.amount,
      currency: input.currency,
      vendorRaw: input.vendorRaw,
      memo: input.memo,
      glAccountId: glId,
      processingStatus: "completed",
      taggingDecision: "AUTO_TAG",
      confidence: "1.0000",
    })
    .returning({ id: transactions.id });

  const useLiveEmbeddings = env.LLM_ENABLE_LIVE_CALLS && hasProviderApiKey(env);

  if (useLiveEmbeddings) {
    try {
      await embedAndStoreTransaction(
        db,
        env,
        input.tenantId,
        inserted.id,
        input.vendorRaw,
        input.memo,
      );
    } catch {
      const text = buildEmbeddingText(input.vendorRaw, input.memo);
      const embedding = buildDeterministicEmbedding(text, env.EMBEDDING_DIMENSIONS);
      await db.insert(transactionEmbeddings).values({
        tenantId: input.tenantId,
        transactionId: inserted.id,
        embedding,
        embeddingModel: "deterministic-import-fallback",
      });
    }
  } else {
    const text = buildEmbeddingText(input.vendorRaw, input.memo);
    const embedding = buildDeterministicEmbedding(text, env.EMBEDDING_DIMENSIONS);
    await db.insert(transactionEmbeddings).values({
      tenantId: input.tenantId,
      transactionId: inserted.id,
      embedding,
      embeddingModel: "deterministic-import",
    });
  }

  return true;
}

/**
 * Builds a tenant CoA gl_code → id map.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Map of gl_code to chart_of_accounts.id.
 */
export async function loadCoaByCode(db: DbClient, tenantId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: chartOfAccounts.id, glCode: chartOfAccounts.glCode })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.tenantId, tenantId));

  return new Map(rows.map((row) => [row.glCode, row.id]));
}
