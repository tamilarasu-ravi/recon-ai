import { NextResponse } from "next/server";
import { z } from "zod";

import { assertTenantApiRateLimit } from "@/lib/api/apply-rate-limit";
import { requireTenantAccess, toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { createApiKeyForTenant, listApiKeysForTenant } from "@/lib/auth/api-keys-admin";
import {
  canBootstrapApiKey,
  resolveTenantIdBySlug,
} from "@/lib/auth/bootstrap-api-key";
import { isApiAuthRequired, isProductionDeployment } from "@/lib/config/runtime";
import { getDb } from "@/lib/db/client";
import { runWithRlsBypass, runWithTenantRls } from "@/lib/db/tenant-rls";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

const createSchema = z
  .object({
    tenant_id: z.string().uuid().optional(),
    tenant_slug: z.string().min(1).max(64).optional(),
    name: z.string().min(1).max(64),
  })
  .refine((data) => Boolean(data.tenant_id ?? data.tenant_slug), {
    message: "tenant_id or tenant_slug is required",
  });

/**
 * Lists API keys for a tenant (masked).
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });

    return await withTenantAccess(
      request,
      parsed.tenant_id,
      async (db) => {
        const keys = await listApiKeysForTenant(db, parsed.tenant_id);
        return NextResponse.json({ keys });
      },
      { permission: "platform:admin" },
    );
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

    return runWithRlsBypass(async () => {
      let tenantId = parsed.tenant_id;

      if (!tenantId && parsed.tenant_slug) {
        tenantId =
          (await resolveTenantIdBySlug(getDb(), parsed.tenant_slug)) ?? undefined;
        if (!tenantId) {
          return NextResponse.json(
            { error: `Unknown tenant_slug: ${parsed.tenant_slug}` },
            { status: 404 },
          );
        }
      }

      if (!tenantId) {
        return NextResponse.json(
          { error: "tenant_id or tenant_slug is required" },
          { status: 400 },
        );
      }

      return runWithTenantRls(tenantId, async () => {
        const db = getDb();
        const authRequired = isApiAuthRequired() || isProductionDeployment();
        const allowBootstrap = authRequired && (await canBootstrapApiKey(db, tenantId));

        if (allowBootstrap) {
          // First key for tenant — ignore stale/invalid Bearer headers from the browser.
        } else {
          await requireTenantAccess(request, tenantId, { permission: "platform:admin" });
          assertTenantApiRateLimit(tenantId, "api-keys-create");
        }

        const created = await createApiKeyForTenant(db, tenantId, parsed.name);

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
      });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "API key create failed");
  }
}
