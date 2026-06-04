import { NextResponse } from "next/server";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { listReviewQueuePage } from "@/lib/data/review-queue-list";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
  status: z.enum(["open", "resolved", "all"]).default("open"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

/**
 * Lists review queue items for a tenant with cursor-based pagination.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      tenant_id: url.searchParams.get("tenant_id"),
      status: url.searchParams.get("status") ?? "open",
      limit: url.searchParams.get("limit") ?? 20,
      cursor: url.searchParams.get("cursor") ?? undefined,
    });

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
      const result = await listReviewQueuePage(
        db,
        parsed.tenant_id,
        parsed.status,
        parsed.limit,
        parsed.cursor,
      );

      return NextResponse.json({
        items: result.items.map((row) => ({
          ...row,
          createdAt:
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : new Date(String(row.createdAt)).toISOString(),
        })),
        page: result.page,
      });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Review queue fetch failed");
  }
}
