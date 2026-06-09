import type { PolicyRuleType } from "@/lib/agents/policy/types";

/**
 * Maps internal policy rule type codes to admin UI labels.
 *
 * @param ruleType - Stored rule_type value.
 * @returns Human-readable rule name.
 */
export function formatPolicyRuleTypeLabel(ruleType: PolicyRuleType | string): string {
  switch (ruleType) {
    case "receipt_required":
      return "Receipt required";
    case "single_transaction_cap":
      return "Transaction cap";
    case "banned_mcc":
      return "Banned MCC";
    default:
      return String(ruleType).replace(/_/g, " ");
  }
}

/**
 * Summarizes a compiled rule config for list/table display.
 *
 * @param ruleType - Policy rule type.
 * @param ruleConfig - Parsed JSON config from policy_rules.
 * @returns One-line configuration summary.
 */
export function formatPolicyRuleConfigSummary(
  ruleType: PolicyRuleType | string,
  ruleConfig: Record<string, unknown>,
): string {
  switch (ruleType) {
    case "receipt_required": {
      const minAmount = ruleConfig.min_amount;
      return typeof minAmount === "number"
        ? `Required for purchases over $${minAmount}`
        : "Receipt required threshold configured";
    }
    case "single_transaction_cap": {
      const maxAmount = ruleConfig.max_amount;
      return typeof maxAmount === "number"
        ? `Blocks auto-coding above $${maxAmount}`
        : "Maximum transaction amount configured";
    }
    case "banned_mcc": {
      const mccs = ruleConfig.mccs;
      if (Array.isArray(mccs) && mccs.length > 0) {
        return `Merchant codes: ${mccs.map(String).join(", ")}`;
      }
      return "Banned merchant category codes configured";
    }
    default:
      return JSON.stringify(ruleConfig);
  }
}

/**
 * Formats an ISO timestamp for policy rule list rows.
 *
 * @param iso - createdAt from API.
 * @returns Locale date string or em dash when invalid.
 */
export function formatPolicyRuleCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
