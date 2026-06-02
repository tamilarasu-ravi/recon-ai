import type { PolicyOutcome } from "@/lib/agents/policy/types";
import type { TaggingDecision } from "@/lib/orchestrator/gates";

/**
 * Downgrades AUTO_TAG when policy outcome requires human review before posting.
 *
 * @param decision - Tagging agent decision.
 * @param policyOutcome - Policy evaluation outcome.
 * @returns Final decision after policy cap.
 */
export function applyPolicyDecisionCap(
  decision: TaggingDecision,
  policyOutcome: PolicyOutcome,
): TaggingDecision {
  if (decision === "AUTO_TAG" && policyOutcome === "FLAG_REVIEW") {
    return "QUEUE_REVIEW";
  }
  return decision;
}
