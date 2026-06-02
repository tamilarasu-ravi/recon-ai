import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { createApiKeyForTenant, listApiKeysForTenant } from "@/lib/auth/api-keys-admin";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(1).max(64),
});

/**
 * Lists API keys for a tenant (masked).
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();
    const keys = await listApiKeysForTenant(db, parsed.tenant_id);

    return NextResponse.json({ keys });
  } catch (error) {
    return toRouteErrorResponse(error, "API key list failed");
  }
}

/**
 * Creates a new API key; returns raw secret once.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = createSchema.parse(body);
    await requireTenantAccess(request, parsed.tenant_id);

    const db = getDb();
    const created = await createApiKeyForTenant(db, parsed.tenant_id, parsed.name);

    return NextResponse.json(
      {
        key: {
          id: created.id,
          name: created.name,
          keyPrefix: created.keyPrefix,
          isActive: created.isActive,
          createdAt: created.createdAt,
        },
        raw_key: created.rawKey,
      },
      { status: 201 },
    );
  } catch (error) {
    return toRouteErrorResponse(error, "API key create failed");
  }
}
