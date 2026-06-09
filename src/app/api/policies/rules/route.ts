import { NextResponse } from "next/server";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { createPolicyRule } from "@/lib/data/policy-admin";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  rule_type: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "Rule type must be a lowercase slug"),
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
        const result = await createPolicyRule(db, {
          tenantId: parsed.tenant_id,
          ruleType: parsed.rule_type,
          ruleConfig: parsed.rule_config,
        });

        return NextResponse.json(
          { rule: result.rule, replaced: result.replaced },
          { status: result.replaced ? 200 : 201 },
        );
      },
      { permission: "policy:admin" },
    );
  } catch (error) {
    return toRouteErrorResponse(error, "Policy rule create failed");
  }
}
