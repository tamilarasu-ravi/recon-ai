import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toRouteErrorResponse, withTenantAccess } from "@/lib/api/tenant-auth";
import { isSsoEnabled } from "@/lib/auth/sso-config";

const querySchema = z.object({
  tenant_id: z.string().uuid().optional(),
});

/**
 * Returns the signed-in user's profile and optional tenant role.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    if (!isSsoEnabled()) {
      return NextResponse.json({
        ssoEnabled: false,
        userId: null,
        email: null,
        role: null,
      });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      tenant_id: searchParams.get("tenant_id") ?? undefined,
    });

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const user = await currentUser();
    const email = user?.emailAddresses[0]?.emailAddress ?? null;

    if (!parsed.tenant_id) {
      return NextResponse.json({
        ssoEnabled: true,
        userId,
        email,
        role: null,
      });
    }

    return await withTenantAccess(request, parsed.tenant_id, async (_db, tenantAuth) => {
      return NextResponse.json({
        ssoEnabled: true,
        userId,
        email,
        role: tenantAuth?.role ?? null,
        tenantId: parsed.tenant_id,
      });
    });
  } catch (error) {
    return toRouteErrorResponse(error, "Profile fetch failed");
  }
}
