import { NextResponse } from "next/server";

import { isApiAuthRequired } from "@/lib/config/runtime";
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
    erp_provider: erpProvider,
    quickbooks_oauth_configured: getQuickBooksConfig() !== null,
    langfuse_enabled: observability.langfuse_enabled,
    langfuse_host: observability.langfuse_host,
    slo_decision_latency_p95_ms: observability.slo_decision_latency_p95_ms,
    slo_auto_tag_precision_min: observability.slo_auto_tag_precision_min,
    bootstrap_hint:
      "When no API key is saved, use Settings → Generate key with tenant slug (first key only).",
  });
}
