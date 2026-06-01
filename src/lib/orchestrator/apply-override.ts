import { and, eq } from "drizzle-orm";

import { normalizeVendor } from "@/lib/agents/tagging/vendor-normalize";
import { appendAuditLog, appendEvent } from "@/lib/audit/writers";
import { newRunId } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";
import {
  chartOfAccounts,
  reviewQueue,
  transactions,
  vendorAliases,
  vendorRules,
  vendors,
} from "@/lib/db/schema";

export interface ApplyOverrideInput {
  tenantId: string;
  transactionId: string;
  glCode: string;
  taxCode?: string;
}

export interface ApplyOverrideResult {
  runId: string;
  vendorId: string;
  glAccountId: string;
  vendorRuleCreated: boolean;
}

/**
 * Persists an accountant override as a vendor rule and updates the transaction GL.
 *
 * @param db - Database client.
 * @param input - Tenant, transaction, and target GL code.
 * @returns Override metadata including whether a new vendor rule was created.
 * @throws Error when transaction or GL code is not found for the tenant.
 */
export async function applyTransactionOverride(
  db: DbClient,
  input: ApplyOverrideInput,
): Promise<ApplyOverrideResult> {
  const runId = newRunId();

  const txnRows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, input.transactionId), eq(transactions.tenantId, input.tenantId)))
    .limit(1);

  const txn = txnRows[0];
  if (!txn) {
    throw new Error("Transaction not found for tenant");
  }

  const coaRows = await db
    .select({ id: chartOfAccounts.id, glCode: chartOfAccounts.glCode })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.tenantId, input.tenantId));

  const glAccount = coaRows.find((row) => row.glCode === input.glCode);
  if (!glAccount) {
    throw new Error(`GL code not in tenant CoA: ${input.glCode}`);
  }

  const vendorResult = await normalizeVendor(db, input.tenantId, txn.vendorRaw);
  let vendorId = vendorResult.vendorId;

  if (!vendorId) {
    const [insertedVendor] = await db
      .insert(vendors)
      .values({ tenantId: input.tenantId, canonicalName: vendorResult.canonicalName })
      .returning({ id: vendors.id });
    vendorId = insertedVendor.id;
    await db.insert(vendorAliases).values({
      tenantId: input.tenantId,
      vendorId,
      aliasRaw: vendorResult.canonicalName,
    });
  }

  const existingRules = await db
    .select({ id: vendorRules.id })
    .from(vendorRules)
    .where(
      and(eq(vendorRules.tenantId, input.tenantId), eq(vendorRules.vendorId, vendorId)),
    )
    .limit(1);

  let vendorRuleCreated = false;

  if (existingRules[0]) {
    await db
      .update(vendorRules)
      .set({
        glAccountId: glAccount.id,
        taxCode: input.taxCode ?? null,
      })
      .where(eq(vendorRules.id, existingRules[0].id));
  } else {
    await db.insert(vendorRules).values({
      tenantId: input.tenantId,
      vendorId,
      glAccountId: glAccount.id,
      taxCode: input.taxCode,
    });
    vendorRuleCreated = true;
  }

  await db
    .update(transactions)
    .set({
      glAccountId: glAccount.id,
      suggestedGlAccountId: glAccount.id,
      taggingDecision: "AUTO_TAG",
      confidence: "1.0000",
      vendorId,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, input.transactionId));

  await db
    .update(reviewQueue)
    .set({ status: "resolved" })
    .where(
      and(
        eq(reviewQueue.transactionId, input.transactionId),
        eq(reviewQueue.tenantId, input.tenantId),
        eq(reviewQueue.status, "open"),
      ),
    );

  await appendEvent(db, {
    tenantId: input.tenantId,
    eventType: "OverrideApplied",
    runId,
    payload: {
      transaction_id: input.transactionId,
      vendor_id: vendorId,
      gl_code: input.glCode,
      vendor_rule_created: vendorRuleCreated,
    },
  });

  await appendAuditLog(db, {
    tenantId: input.tenantId,
    runId,
    agent: "override",
    transactionId: input.transactionId,
    decision: "AUTO_TAG",
    confidence: 1,
    observability: {
      gl_code: input.glCode,
      vendor_rule_created: vendorRuleCreated,
      canonical_vendor: vendorResult.canonicalName,
    },
  });

  return {
    runId,
    vendorId,
    glAccountId: glAccount.id,
    vendorRuleCreated,
  };
}
