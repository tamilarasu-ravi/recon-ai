import { and, eq, isNotNull } from "drizzle-orm";

import type { PolicyOutcome } from "@/lib/agents/policy/types";
import type { DbClient } from "@/lib/db/client";
import { receipts } from "@/lib/db/schema";

/**
 * Returns whether tagging must treat the transaction as receipt-blocked for AUTO_TAG.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param transactionId - Transaction UUID.
 * @param policyOutcome - Outcome from policy evaluation.
 * @returns True when receipt is required by policy and not yet cleared on file.
 */
export async function isReceiptRequiredAndNotCleared(
  db: DbClient,
  tenantId: string,
  transactionId: string,
  policyOutcome: PolicyOutcome,
): Promise<boolean> {
  if (policyOutcome !== "FLAG_RECEIPT") {
    return false;
  }

  const cleared = await db
    .select({ id: receipts.id })
    .from(receipts)
    .where(
      and(
        eq(receipts.tenantId, tenantId),
        eq(receipts.transactionId, transactionId),
        isNotNull(receipts.clearedAt),
      ),
    )
    .limit(1);

  return cleared.length === 0;
}
