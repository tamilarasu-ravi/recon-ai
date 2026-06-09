import { policyRuleConfigByType, type PolicyRuleType } from "@/lib/agents/policy/types";

const RULE_TYPE_SLUG_PATTERN = /^[a-z][a-z0-9_]*$/;

const RULE_TYPE_ALIASES: Record<string, PolicyRuleType> = {
  receipt_required: "receipt_required",
  receipt: "receipt_required",
  "receipt required": "receipt_required",
  single_transaction_cap: "single_transaction_cap",
  transaction_cap: "single_transaction_cap",
  cap: "single_transaction_cap",
  "transaction cap": "single_transaction_cap",
  banned_mcc: "banned_mcc",
  mcc: "banned_mcc",
  "banned mcc": "banned_mcc",
};

export const POLICY_RULE_CONFIG_EXAMPLES: Record<PolicyRuleType, string> = {
  receipt_required: '{\n  "min_amount": 75\n}',
  single_transaction_cap: '{\n  "max_amount": 5000\n}',
  banned_mcc: '{\n  "mccs": ["7995", "7996"]\n}',
};

export const CUSTOM_RULE_CONFIG_EXAMPLE = '{\n  "description": "Custom policy note",\n  "enabled": true\n}';

/**
 * Maps a user-entered name to a built-in policy rule type when it matches.
 *
 * @param name - Raw rule name from the add form.
 * @returns Built-in rule type, or null when not a known alias.
 */
export function normalizePolicyRuleTypeName(name: string): PolicyRuleType | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  const underscored = lowered.replace(/\s+/g, "_");

  return (
    RULE_TYPE_ALIASES[lowered] ??
    RULE_TYPE_ALIASES[underscored] ??
    (underscored in policyRuleConfigByType ? (underscored as PolicyRuleType) : null)
  );
}

/**
 * Normalizes any manual rule name to a stored rule_type slug.
 *
 * @param name - Raw rule name from the add form.
 * @returns Slug for policy_rules.rule_type, or null when invalid.
 */
export function normalizeManualRuleTypeName(name: string): string | null {
  const knownType = normalizePolicyRuleTypeName(name);
  if (knownType) {
    return knownType;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  const slug = trimmed
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  return RULE_TYPE_SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * Parses manual add-form name + JSON config for built-in or custom policy rules.
 *
 * @param name - Rule name or type slug.
 * @param configText - JSON configuration string.
 * @returns Rule type slug and config object.
 * @throws Error when the name or JSON config is invalid.
 */
export function parseManualPolicyRuleInput(
  name: string,
  configText: string,
): { ruleType: string; ruleConfig: Record<string, unknown> } {
  const ruleType = normalizeManualRuleTypeName(name);
  if (!ruleType) {
    throw new Error(
      "Rule name must start with a letter and use only letters, numbers, or underscores.",
    );
  }

  let parsedConfig: unknown;
  try {
    parsedConfig = JSON.parse(configText);
  } catch {
    throw new Error("Configuration must be valid JSON.");
  }

  if (
    typeof parsedConfig !== "object" ||
    parsedConfig === null ||
    Array.isArray(parsedConfig)
  ) {
    throw new Error("Configuration must be a JSON object.");
  }

  const ruleConfig = parsedConfig as Record<string, unknown>;

  if (ruleType in policyRuleConfigByType) {
    const validation = policyRuleConfigByType[ruleType as PolicyRuleType].safeParse(ruleConfig);
    if (!validation.success) {
      throw new Error(validation.error.issues[0]?.message ?? "Invalid rule configuration.");
    }

    return {
      ruleType,
      ruleConfig: validation.data as Record<string, unknown>,
    };
  }

  if (Object.keys(ruleConfig).length === 0) {
    throw new Error("Custom rule configuration must include at least one field.");
  }

  return { ruleType, ruleConfig };
}

/**
 * Returns whether a rule type slug is evaluated by the deterministic policy engine.
 *
 * @param ruleType - Stored policy_rules.rule_type value.
 * @returns True for built-in compiled rule types.
 */
export function isEvaluatedPolicyRuleType(ruleType: string): boolean {
  return ruleType in policyRuleConfigByType;
}
