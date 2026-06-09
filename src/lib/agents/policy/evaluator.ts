import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { loadNormalizedPolicyRules } from "@/lib/data/policy-admin";
import { policies } from "@/lib/db/schema";
import {
  bannedMccRuleConfigSchema,
  type PolicyEvaluationInput,
  type PolicyEvaluationResult,
  type PolicyOutcome,
  type PolicyRuleRow,
  type PolicyRuleType,
  receiptRequiredRuleConfigSchema,
  singleTransactionCapRuleConfigSchema,
} from "@/lib/agents/policy/types";

const OUTCOME_SEVERITY: Record<PolicyOutcome, number> = {
  ALLOW: 0,
  FLAG_RECEIPT: 1,
  FLAG_REVIEW: 2,
};

/**
 * Picks the strictest policy outcome when multiple rules match.
 *
 * @param outcomes - Matched rule outcomes.
 * @returns Highest-severity outcome.
 */
function mergeOutcomes(outcomes: PolicyOutcome[]): PolicyOutcome {
  return outcomes.reduce<PolicyOutcome>(
    (strictest, current) =>
      OUTCOME_SEVERITY[current] > OUTCOME_SEVERITY[strictest] ? current : strictest,
    "ALLOW",
  );
}

/**
 * Evaluates one compiled policy rule against a transaction (pure, no I/O).
 *
 * @param rule - Rule type and JSON config from policy_rules.
 * @param input - Transaction fields used by policy rules.
 * @returns Matched outcome and reason, or null when rule does not apply.
 */
export function evaluatePolicyRule(
  rule: PolicyRuleRow,
  input: PolicyEvaluationInput,
): { outcome: PolicyOutcome; reason: string } | null {
  const amount = Number.parseFloat(input.amount);
  if (Number.isNaN(amount)) {
    return { outcome: "FLAG_REVIEW", reason: "invalid_amount" };
  }

  switch (rule.ruleType) {
    case "receipt_required": {
      const config = receiptRequiredRuleConfigSchema.parse(rule.ruleConfig);
      if (amount >= config.min_amount) {
        return {
          outcome: "FLAG_RECEIPT",
          reason: `amount_${amount}_gte_${config.min_amount}`,
        };
      }
      return null;
    }
    case "banned_mcc": {
      const config = bannedMccRuleConfigSchema.parse(rule.ruleConfig);
      if (input.mcc && config.mccs.includes(input.mcc)) {
        return { outcome: "FLAG_REVIEW", reason: `banned_mcc_${input.mcc}` };
      }
      return null;
    }
    case "single_transaction_cap": {
      const config = singleTransactionCapRuleConfigSchema.parse(rule.ruleConfig);
      if (amount > config.max_amount) {
        return {
          outcome: "FLAG_REVIEW",
          reason: `amount_${amount}_gt_cap_${config.max_amount}`,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Evaluates all rules for an active tenant policy pack (pure evaluation on loaded rows).
 *
 * @param policyVersion - Active policy version string.
 * @param policyId - Active policy UUID.
 * @param rules - Compiled rules for the policy.
 * @param input - Transaction fields.
 * @returns Aggregated policy outcome and match metadata.
 */
export function evaluatePolicyRules(
  policyVersion: string,
  policyId: string,
  rules: PolicyRuleRow[],
  input: PolicyEvaluationInput,
): PolicyEvaluationResult {
  const matchedRules: PolicyEvaluationResult["matchedRules"] = [];
  const outcomes: PolicyOutcome[] = ["ALLOW"];

  for (const rule of rules) {
    const match = evaluatePolicyRule(rule, input);
    if (match) {
      matchedRules.push({ ruleType: rule.ruleType, reason: match.reason });
      outcomes.push(match.outcome);
    }
  }

  return {
    outcome: mergeOutcomes(outcomes),
    policyVersion,
    policyId,
    matchedRules,
  };
}

/**
 * Loads the active policy pack for a tenant and evaluates transaction context.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param input - Transaction fields for rule evaluation.
 * @returns Policy result, or ALLOW with version `none` when no active policy exists.
 */
export async function evaluateTransactionPolicy(
  db: DbClient,
  tenantId: string,
  input: PolicyEvaluationInput,
): Promise<PolicyEvaluationResult> {
  const activePolicies = await db
    .select({
      id: policies.id,
      policyVersion: policies.policyVersion,
    })
    .from(policies)
    .where(and(eq(policies.tenantId, tenantId), eq(policies.isActive, true)))
    .limit(1);

  const active = activePolicies[0];
  if (!active) {
    return {
      outcome: "ALLOW",
      policyVersion: "none",
      policyId: "00000000-0000-0000-0000-000000000000",
      matchedRules: [],
    };
  }

  const ruleRows = await loadNormalizedPolicyRules(db, active.id);

  const rules: PolicyRuleRow[] = ruleRows.map((row) => ({
    ruleType: row.ruleType,
    ruleConfig: row.ruleConfig,
  }));

  return evaluatePolicyRules(active.policyVersion, active.id, rules, input);
}
