import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import {
  auditLog,
  chartOfAccounts,
  events,
  reviewQueue,
  transactions,
} from "@/lib/db/schema";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Returns transaction detail with latest tagging audit trace and review queue state.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: transactionId } = await context.params;
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });
    const db = getDb();

    const txnRows = await db
      .select({
        id: transactions.id,
        externalTransactionId: transactions.externalTransactionId,
        vendorRaw: transactions.vendorRaw,
        memo: transactions.memo,
        amount: transactions.amount,
        currency: transactions.currency,
        mcc: transactions.mcc,
        taggingDecision: transactions.taggingDecision,
        confidence: transactions.confidence,
        processingStatus: transactions.processingStatus,
        glAccountId: transactions.glAccountId,
        suggestedGlAccountId: transactions.suggestedGlAccountId,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
      })
      .from(transactions)
      .where(
        and(eq(transactions.id, transactionId), eq(transactions.tenantId, parsed.tenant_id)),
      )
      .limit(1);

    const txn = txnRows[0];
    if (!txn) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const coaRows = await db
      .select({ id: chartOfAccounts.id, glCode: chartOfAccounts.glCode, glName: chartOfAccounts.glName })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.tenantId, parsed.tenant_id));

    const glById = new Map(coaRows.map((row) => [row.id, row]));

    const auditRows = await db
      .select({
        id: auditLog.id,
        runId: auditLog.runId,
        agent: auditLog.agent,
        decision: auditLog.decision,
        confidence: auditLog.confidence,
        policyVersion: auditLog.policyVersion,
        observability: auditLog.observability,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(
        and(eq(auditLog.transactionId, transactionId), eq(auditLog.tenantId, parsed.tenant_id)),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(10);

    const runIds = auditRows.map((row) => row.runId);
    const eventRows =
      runIds.length > 0
        ? await db
            .select({
              eventType: events.eventType,
              payload: events.payload,
              runId: events.runId,
              createdAt: events.createdAt,
            })
            .from(events)
            .where(and(eq(events.tenantId, parsed.tenant_id), inArray(events.runId, runIds)))
            .orderBy(desc(events.createdAt))
            .limit(20)
        : [];

    const reviewRows = await db
      .select({
        id: reviewQueue.id,
        reason: reviewQueue.reason,
        status: reviewQueue.status,
        runId: reviewQueue.runId,
        createdAt: reviewQueue.createdAt,
      })
      .from(reviewQueue)
      .where(
        and(eq(reviewQueue.transactionId, transactionId), eq(reviewQueue.tenantId, parsed.tenant_id)),
      )
      .orderBy(desc(reviewQueue.createdAt))
      .limit(5);

    const suggestedGl = txn.suggestedGlAccountId
      ? glById.get(txn.suggestedGlAccountId)
      : undefined;
    const postedGl = txn.glAccountId ? glById.get(txn.glAccountId) : undefined;

    return NextResponse.json({
      transaction: {
        ...txn,
        suggested_gl: suggestedGl ?? null,
        posted_gl: postedGl ?? null,
      },
      review_queue: reviewRows,
      audit_trail: auditRows,
      events: eventRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transaction fetch failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
