import { NextResponse } from "next/server";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import {
  createWebhookSecretForTenant,
  listWebhookSecretsForTenant,
} from "@/lib/auth/webhook-secrets-admin";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(1).max(64),
});

/**
 * Lists webhook signing secrets for a tenant (masked).
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });

    return await withTenantAccess(
      request,
      parsed.tenant_id,
      async (db) => {
        const secrets = await listWebhookSecretsForTenant(db, parsed.tenant_id);
        return NextResponse.json({ secrets });
      },
      { permission: "platform:admin" },
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Webhook secret list failed");
  }
}

/**
 * Creates a new webhook signing secret; returns raw secret once.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = createSchema.parse(body);

    return await withTenantAccess(
      request,
      parsed.tenant_id,
      async (db) => {
        const created = await createWebhookSecretForTenant(db, parsed.tenant_id, parsed.name);

        return NextResponse.json(
          {
            secret: {
              id: created.id,
              name: created.name,
              secretPrefix: created.secretPrefix,
              isActive: created.isActive,
              createdAt: created.createdAt,
            },
            raw_secret: created.rawSecret,
          },
          { status: 201 },
        );
      },
      { permission: "platform:admin" },
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Webhook secret create failed");
  }
}
