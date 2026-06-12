import { eq } from "drizzle-orm";

import type { TaggingAgentResult } from "@/lib/agents/tagging/run-tagging-agent";
import type { DbClient } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";

export interface PersistTaggingAgentResultInput
  extends Pick<
    TaggingAgentResult,
    | "vendorId"
    | "suggestedGlAccountId"
    | "decision"
    | "confidence"
    | "taxCode"
    | "dimensions"
  > {}

/**
 * Persists provisional tagging fields after the agent returns (orchestrator-owned write path).
 *
 * @param db - Database client.
 * @param transactionId - Transaction UUID to update.
 * @param result - Agent output fields to persist before policy cap / final persist.
 */
export async function persistTaggingAgentResult(
  db: DbClient,
  transactionId: string,
  result: PersistTaggingAgentResultInput,
): Promise<void> {
  await db
    .update(transactions)
    .set({
      vendorId: result.vendorId ?? undefined,
      suggestedGlAccountId: result.suggestedGlAccountId,
      taggingDecision: result.decision,
      confidence: String(result.confidence),
      taxCode: result.taxCode ?? undefined,
      dimensions: result.dimensions,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, transactionId));
}
