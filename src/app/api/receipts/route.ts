import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { receipts, transactions } from "@/lib/db/schema";

const receiptUploadSchema = z.object({
  tenant_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  receipt_text: z.string().min(1).max(4000),
});

/**
 * Uploads or updates mock receipt text and marks the receipt as cleared for policy gating.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = receiptUploadSchema.parse(body);

    return await withTenantAccess(
      request,
      parsed.tenant_id,
      async (db) => {
      const txnRows = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.id, parsed.transaction_id),
            eq(transactions.tenantId, parsed.tenant_id),
          ),
        )
        .limit(1);

      if (!txnRows[0]) {
        return NextResponse.json({ error: "Transaction not found for tenant" }, { status: 404 });
      }

      const existingReceipt = await db
        .select({ id: receipts.id })
        .from(receipts)
        .where(
          and(
            eq(receipts.tenantId, parsed.tenant_id),
            eq(receipts.transactionId, parsed.transaction_id),
          ),
        )
        .limit(1);

      const clearedAt = new Date();

      if (existingReceipt[0]) {
        await db
          .update(receipts)
          .set({ receiptText: parsed.receipt_text, clearedAt })
          .where(eq(receipts.id, existingReceipt[0].id));
      } else {
        await db.insert(receipts).values({
          tenantId: parsed.tenant_id,
          transactionId: parsed.transaction_id,
          receiptText: parsed.receipt_text,
          clearedAt,
        });
      }

      return NextResponse.json({
        status: "cleared",
        transaction_id: parsed.transaction_id,
        cleared_at: clearedAt.toISOString(),
      });
    },
      { permission: "review:write" },
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Receipt upload failed");
  }
}
