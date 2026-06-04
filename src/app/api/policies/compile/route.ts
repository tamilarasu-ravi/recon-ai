import { NextResponse } from "next/server";
import { z } from "zod";

import { assertTenantApiRateLimit } from "@/lib/api/apply-rate-limit";
import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { compileAndOptionalPersistPolicy } from "@/lib/agents/policy/compile-natural-language";
import { loadEnv } from "@/lib/config/env";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const compileSchema = z.object({
  tenant_id: z.string().uuid(),
  natural_language: z.string().min(8).max(2000),
  persist: z.boolean().default(false),
});

/**
 * Compiles natural-language policy text to a structured rule (preview or persist).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = compileSchema.parse(body);
    assertTenantApiRateLimit(parsed.tenant_id, "policies-compile");

    return await withTenantAccess(request, parsed.tenant_id, async (db) => {
      const env = loadEnv();

      const result = await compileAndOptionalPersistPolicy(
        db,
        env,
        parsed.tenant_id,
        parsed.natural_language,
        parsed.persist,
      );

      return NextResponse.json({
        compiled: result.compiled,
        prompt_version: result.promptVersion,
        model: result.model,
        persisted: result.persisted ?? null,
      });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Policy compile failed");
  }
}
