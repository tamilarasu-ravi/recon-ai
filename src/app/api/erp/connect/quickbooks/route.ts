import { NextResponse } from "next/server";
import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import {
  buildQuickBooksAuthorizeUrl,
  getQuickBooksConfig,
} from "@/lib/integrations/erp/quickbooks/config";
import {
  newOAuthStateNonce,
  signQuickBooksOAuthState,
} from "@/lib/integrations/erp/quickbooks/oauth-state";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  tenant_id: z.string().uuid(),
});

/**
 * Starts QuickBooks sandbox OAuth — redirects to Intuit authorize URL.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.parse({ tenant_id: url.searchParams.get("tenant_id") });
    await requireTenantAccess(request, parsed.tenant_id);

    const config = getQuickBooksConfig();
    if (!config) {
      return NextResponse.json(
        {
          error:
            "QuickBooks OAuth is not configured — set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REDIRECT_URI",
        },
        { status: 503 },
      );
    }

    const state = signQuickBooksOAuthState(
      { tenantId: parsed.tenant_id, nonce: newOAuthStateNonce() },
      config.clientSecret,
    );

    const authorizeUrl = buildQuickBooksAuthorizeUrl(config, state);
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    return toRouteErrorResponse(error, "QuickBooks connect failed");
  }
}
