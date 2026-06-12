import { isGlInCoaAllowList } from "@/lib/orchestrator/gates";

export interface RetrievalPolicyInput {
  ruleHit: boolean;
  ruleGlAccountId: string | undefined;
  isNewVendor: boolean;
  coaAllowList: Set<string>;
  agenticEnabled: boolean;
}

export type RetrievalSkipReason =
  | "agentic_disabled"
  | "new_vendor_requires_retrieval"
  | "no_rule_hit"
  | "rule_gl_not_in_coa"
  | "vendor_rule_sufficient"
  | "planner_omitted_retrieval";

export interface RetrievalPolicyResult {
  shouldRetrieve: boolean;
  skipReason: RetrievalSkipReason;
}

/**
 * Decides whether pgvector retrieval runs before tagging (agentic Phase 1).
 *
 * @param input - Rule hit, vendor novelty, CoA allow-list, and feature flag.
 * @returns Whether to embed and retrieve neighbors, plus a trace-friendly skip reason.
 */
export function resolveRetrievalPolicy(input: RetrievalPolicyInput): RetrievalPolicyResult {
  if (!input.agenticEnabled) {
    return { shouldRetrieve: true, skipReason: "agentic_disabled" };
  }

  if (!input.ruleHit || input.ruleGlAccountId === undefined) {
    return { shouldRetrieve: true, skipReason: "no_rule_hit" };
  }

  if (input.isNewVendor) {
    return { shouldRetrieve: true, skipReason: "new_vendor_requires_retrieval" };
  }

  if (!isGlInCoaAllowList(input.ruleGlAccountId, input.coaAllowList)) {
    return { shouldRetrieve: true, skipReason: "rule_gl_not_in_coa" };
  }

  return { shouldRetrieve: false, skipReason: "vendor_rule_sufficient" };
}
