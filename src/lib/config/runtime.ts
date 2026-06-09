/**
 * Deployment/runtime helpers — distinguish local dev from Vercel production.
 */

/**
 * Returns true when running a production deployment (Vercel production or NODE_ENV=production).
 *
 * @returns Whether production hardening rules should apply.
 */
export function isProductionDeployment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === "production") {
    return true;
  }

  return process.env.NODE_ENV?.trim().toLowerCase() === "production";
}

/**
 * Returns true when API key auth is required for programmatic routes.
 *
 * @returns Whether REQUIRE_API_AUTH is enabled.
 */
export function isApiAuthRequired(): boolean {
  return process.env.REQUIRE_API_AUTH?.trim().toLowerCase() === "true";
}

/**
 * Returns true when Settings should show webhook and ERP integration panels.
 *
 * @returns Whether SETTINGS_SHOW_INTEGRATIONS is enabled (default hidden for showcase).
 */
export function isSettingsIntegrationsVisible(): boolean {
  return process.env.SETTINGS_SHOW_INTEGRATIONS?.trim().toLowerCase() === "true";
}

/**
 * Returns true when Settings should show developer ingest and bulk-import panels.
 *
 * @returns Whether SETTINGS_SHOW_DEV_TOOLS is enabled (default hidden for showcase).
 */
export function isSettingsDevToolsVisible(): boolean {
  return process.env.SETTINGS_SHOW_DEV_TOOLS?.trim().toLowerCase() === "true";
}

/**
 * Returns true when Settings should show tenant API key generation and listing.
 *
 * @returns Whether SETTINGS_SHOW_API_KEY_ADMIN is enabled (default hidden for showcase).
 */
export function isSettingsApiKeyAdminVisible(): boolean {
  return process.env.SETTINGS_SHOW_API_KEY_ADMIN?.trim().toLowerCase() === "true";
}

export interface ProductionConfigIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * Validates environment for a public production deployment.
 *
 * @returns List of blocking errors and non-blocking warnings.
 */
export function collectProductionConfigIssues(): ProductionConfigIssue[] {
  const issues: ProductionConfigIssue[] = [];

  if (!process.env.DATABASE_URL?.trim()) {
    issues.push({
      code: "database_url_missing",
      message: "DATABASE_URL is required",
      severity: "error",
    });
  }

  if (!isApiAuthRequired()) {
    issues.push({
      code: "api_auth_disabled",
      message: "Set REQUIRE_API_AUTH=true before exposing the API publicly",
      severity: "error",
    });
  }

  const liveCalls = process.env.LLM_ENABLE_LIVE_CALLS?.trim().toLowerCase() !== "false";
  if (liveCalls) {
    const provider = process.env.LLM_PROVIDER?.trim() ?? "google";
    const keyByProvider: Record<string, string | undefined> = {
      google: process.env.GOOGLE_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
    };
    const key = keyByProvider[provider]?.trim();
    if (!key) {
      issues.push({
        code: "llm_key_missing",
        message: `LLM_ENABLE_LIVE_CALLS is on but no API key for LLM_PROVIDER=${provider}`,
        severity: "error",
      });
    }
  }

  if (process.env.LANGGRAPH_CHECKPOINTER?.trim().toLowerCase() === "memory") {
    issues.push({
      code: "memory_checkpointer",
      message: "LANGGRAPH_CHECKPOINTER=memory is not suitable for multi-instance production",
      severity: "warning",
    });
  }

  return issues;
}
