import { NextResponse } from "next/server";

import {
  isApiAuthRequired,
  isSettingsApiKeyAdminVisible,
  isSettingsDevToolsVisible,
  isSettingsIntegrationsVisible,
} from "@/lib/config/runtime";
import { isSsoEnabled } from "@/lib/auth/sso-config";
import { getQuickBooksConfig } from "@/lib/integrations/erp/quickbooks/config";
import { getObservabilityRuntimeStatus } from "@/lib/observability/runtime-status";

/**
 * Returns non-secret runtime flags for the browser UI.
 */
export async function GET(): Promise<NextResponse> {
  const erpProvider = process.env.ERP_PROVIDER?.trim() || "mock";
  const observability = getObservabilityRuntimeStatus();

  return NextResponse.json({
    require_api_auth: isApiAuthRequired(),
    show_integrations: isSettingsIntegrationsVisible(),
    show_dev_tools: isSettingsDevToolsVisible(),
    show_api_key_admin: isSettingsApiKeyAdminVisible(),
    sso_enabled: isSsoEnabled(),
    erp_provider: erpProvider,
    quickbooks_oauth_configured: getQuickBooksConfig() !== null,
    langfuse_enabled: observability.langfuse_enabled,
    langfuse_host: observability.langfuse_host,
    slo_decision_latency_p95_ms: observability.slo_decision_latency_p95_ms,
    slo_auto_tag_precision_min: observability.slo_auto_tag_precision_min,
    bootstrap_hint: isSettingsApiKeyAdminVisible()
      ? "When no API key is saved, use Settings → Generate key with tenant slug (first key only)."
      : "When no API key is saved, paste a key from your administrator or run pnpm auth:reset-keys locally.",
  });
}
