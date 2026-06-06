import { NextResponse } from "next/server";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { createPolicyRule } from "@/lib/data/policy-admin";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  rule_type: z.enum(["receipt_required", "banned_mcc", "single_transaction_cap"]),
  rule_config: z.record(z.unknown()),
});

/**
 * Adds a compiled rule to the tenant active policy pack.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = createSchema.parse(body);

    return await withTenantAccess(
      request,
      parsed.tenant_id,
      async (db) => {
        const rule = await createPolicyRule(db, {
          tenantId: parsed.tenant_id,
          ruleType: parsed.rule_type,
          ruleConfig: parsed.rule_config,
        });

        return NextResponse.json({ rule }, { status: 201 });
      },
      { permission: "policy:admin" },
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Policy rule create failed");
  }
}
