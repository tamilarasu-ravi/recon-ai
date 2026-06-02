import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { reviewQueue } from "@/lib/db/schema";
import type { TaggingDecision } from "@/lib/orchestrator/gates";

/**
 * Resolves open review-queue items and optionally opens a new one after tagging completes.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param transactionId - Transaction UUID.
 * @param decision - Final tagging decision.
 * @param reason - Machine reason code for review/refuse.
 * @param runId - Orchestrator run id for correlation.
 */
export async function syncReviewQueueAfterTagging(
  db: DbClient,
  tenantId: string,
  transactionId: string,
  decision: TaggingDecision,
  reason: string,
  runId: string,
): Promise<void> {
  await db
    .update(reviewQueue)
    .set({ status: "resolved" })
    .where(
      and(
        eq(reviewQueue.tenantId, tenantId),
        eq(reviewQueue.transactionId, transactionId),
        eq(reviewQueue.status, "open"),
      ),
    );

  if (decision === "QUEUE_REVIEW" || decision === "REFUSE") {
    await db.insert(reviewQueue).values({
      tenantId,
      transactionId,
      reason,
      status: "open",
      runId,
    });
  }
}
