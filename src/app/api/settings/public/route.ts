import { NextResponse } from "next/server";

import { isApiAuthRequired, isProductionDeployment } from "@/lib/config/runtime";
import { getQuickBooksConfig } from "@/lib/integrations/erp/quickbooks/config";

/**
 * Returns non-secret runtime flags for the browser UI.
 */
export async function GET(): Promise<NextResponse> {
  const erpProvider = process.env.ERP_PROVIDER?.trim() || "mock";

  return NextResponse.json({
    require_api_auth: isApiAuthRequired() || isProductionDeployment(),
    erp_provider: erpProvider,
    quickbooks_oauth_configured: getQuickBooksConfig() !== null,
    bootstrap_hint:
      "When no API key is saved, use Settings → Generate key with tenant slug (first key only).",
  });
}
