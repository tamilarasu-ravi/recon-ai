import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { events, receipts, transactions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

const RECEIPT_CHASE_EVENT = "ReceiptChaseSent";

/**
 * Lists receipt chase notifications sent for transactions still missing cleared receipts.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
      const chaseEvents = await db
        .select({
          id: events.id,
          runId: events.runId,
          payload: events.payload,
          createdAt: events.createdAt,
        })
        .from(events)
        .where(and(eq(events.tenantId, parsed.tenant_id), eq(events.eventType, RECEIPT_CHASE_EVENT)))
        .orderBy(desc(events.createdAt))
        .limit(100);

      const openChases = [];

      for (const event of chaseEvents) {
        const payload = event.payload as Record<string, unknown>;
        const transactionId = payload.transaction_id;
        if (typeof transactionId !== "string") {
          continue;
        }

        const [receipt] = await db
          .select({ clearedAt: receipts.clearedAt })
          .from(receipts)
          .where(
            and(eq(receipts.tenantId, parsed.tenant_id), eq(receipts.transactionId, transactionId)),
          )
          .limit(1);

        if (receipt?.clearedAt) {
          continue;
        }

        const txnRows = await db
          .select({
            vendorRaw: transactions.vendorRaw,
            amount: transactions.amount,
            currency: transactions.currency,
          })
          .from(transactions)
          .where(
            and(eq(transactions.tenantId, parsed.tenant_id), eq(transactions.id, transactionId)),
          )
          .limit(1);

        openChases.push({
          event_id: event.id,
          run_id: event.runId,
          transaction_id: transactionId,
          channel: payload.channel,
          message: payload.message,
          vendor_raw: txnRows[0]?.vendorRaw ?? payload.vendor_raw,
          amount: txnRows[0]?.amount ?? payload.amount,
          currency: txnRows[0]?.currency ?? payload.currency,
          sent_at:
            event.createdAt instanceof Date
              ? event.createdAt.toISOString()
              : new Date(String(event.createdAt)).toISOString(),
        });
      }

      return NextResponse.json({ chases: openChases });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Receipt chase list failed");
  }
}
