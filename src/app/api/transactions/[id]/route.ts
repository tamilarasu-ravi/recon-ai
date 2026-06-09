import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import {
  auditLog,
  chartOfAccounts,
  events,
  receipts,
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

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
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
          erpProvider: transactions.erpProvider,
          erpExternalId: transactions.erpExternalId,
          erpPostedAt: transactions.erpPostedAt,
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
        .limit(20);

      const eventRows = await db
        .select({
          eventType: events.eventType,
          payload: events.payload,
          runId: events.runId,
          createdAt: events.createdAt,
        })
        .from(events)
        .where(
          and(
            eq(events.tenantId, parsed.tenant_id),
            sql`${events.payload}->>'transaction_id' = ${transactionId}`,
          ),
        )
        .orderBy(desc(events.createdAt))
        .limit(40);

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

      const receiptRows = await db
        .select({
          clearedAt: receipts.clearedAt,
          receiptText: receipts.receiptText,
        })
        .from(receipts)
        .where(
          and(eq(receipts.transactionId, transactionId), eq(receipts.tenantId, parsed.tenant_id)),
        )
        .limit(1);

      const receipt = receiptRows[0] ?? null;

      const suggestedGl = txn.suggestedGlAccountId
        ? glById.get(txn.suggestedGlAccountId)
        : undefined;
      const postedGl = txn.glAccountId ? glById.get(txn.glAccountId) : undefined;

      const pendingEvent = eventRows.find((event) => event.eventType === "AutoTagPendingApproval");

      const coaOptions = [...coaRows]
        .sort((left, right) => left.glCode.localeCompare(right.glCode))
        .map((row) => ({ glCode: row.glCode, glName: row.glName }));

      return NextResponse.json({
        transaction: {
          ...txn,
          suggested_gl: suggestedGl ?? null,
          posted_gl: postedGl ?? null,
          erp_posted_at:
            txn.erpPostedAt instanceof Date
              ? txn.erpPostedAt.toISOString()
              : txn.erpPostedAt
                ? new Date(String(txn.erpPostedAt)).toISOString()
                : null,
        },
        coa_options: coaOptions,
        review_queue: reviewRows,
        receipt,
        audit_trail: auditRows,
        events: eventRows,
        pending_auto_tag: pendingEvent
          ? {
              run_id: pendingEvent.runId,
              payload: pendingEvent.payload,
            }
          : null,
      });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Transaction fetch failed");
  }
}
