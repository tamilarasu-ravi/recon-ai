import { and, eq } from "drizzle-orm";

import { appendEvent } from "@/lib/audit/writers";
import type { DbClient } from "@/lib/db/client";
import { chartOfAccounts, transactions } from "@/lib/db/schema";
import { getErpAdapter } from "@/lib/integrations/erp/mock-adapter";

export interface SyncAutoTagToErpInput {
  tenantId: string;
  transactionId: string;
  runId: string;
  glAccountId: string;
}

/**
 * Posts an AUTO_TAG transaction to the configured ERP adapter and persists external ids.
 *
 * @param db - Database client.
 * @param input - Tenant, transaction, run, and GL account ids.
 * @returns ERP post result, or null when transaction is not eligible.
 * @throws Error when GL account is missing or ERP post fails.
 */
export async function syncAutoTagToErp(
  db: DbClient,
  input: SyncAutoTagToErpInput,
): Promise<{ externalId: string; provider: string; postedAt: string } | null> {
  const txnRows = await db
    .select({
      id: transactions.id,
      externalTransactionId: transactions.externalTransactionId,
      vendorRaw: transactions.vendorRaw,
      amount: transactions.amount,
      currency: transactions.currency,
      taggingDecision: transactions.taggingDecision,
      erpExternalId: transactions.erpExternalId,
    })
    .from(transactions)
    .where(and(eq(transactions.id, input.transactionId), eq(transactions.tenantId, input.tenantId)))
    .limit(1);

  const txn = txnRows[0];
  if (!txn) {
    throw new Error("Transaction not found for ERP sync");
  }

  if (txn.taggingDecision !== "AUTO_TAG") {
    return null;
  }

  if (txn.erpExternalId) {
    return {
      externalId: txn.erpExternalId,
      provider: "mock",
      postedAt: new Date().toISOString(),
    };
  }

  const glRows = await db
    .select({ glCode: chartOfAccounts.glCode, glName: chartOfAccounts.glName })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.id, input.glAccountId),
        eq(chartOfAccounts.tenantId, input.tenantId),
      ),
    )
    .limit(1);

  const gl = glRows[0];
  if (!gl) {
    throw new Error("GL account not found for ERP post");
  }

  const adapter = getErpAdapter();
  const result = await adapter.postJournalEntry({
    tenantId: input.tenantId,
    transactionId: input.transactionId,
    runId: input.runId,
    externalTransactionId: txn.externalTransactionId,
    vendorRaw: txn.vendorRaw,
    amount: String(txn.amount),
    currency: txn.currency,
    glAccountId: input.glAccountId,
    glCode: gl.glCode,
    glName: gl.glName,
  });

  const postedAtDate = new Date(result.postedAt);

  await db
    .update(transactions)
    .set({
      glAccountId: input.glAccountId,
      erpProvider: result.provider,
      erpExternalId: result.externalId,
      erpPostedAt: postedAtDate,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, input.transactionId));

  await appendEvent(db, {
    tenantId: input.tenantId,
    eventType: "ErpTransactionPosted",
    runId: input.runId,
    payload: {
      transaction_id: input.transactionId,
      erp_provider: result.provider,
      erp_external_id: result.externalId,
      gl_account_id: input.glAccountId,
      sandbox: result.sandbox,
    },
  });

  return {
    externalId: result.externalId,
    provider: result.provider,
    postedAt: result.postedAt,
  };
}
