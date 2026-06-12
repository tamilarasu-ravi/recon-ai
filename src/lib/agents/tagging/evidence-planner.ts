import type { AppEnv } from "@/lib/config/env";
import type { PolicyOutcome } from "@/lib/agents/policy/types";
import { isGlInCoaAllowList } from "@/lib/orchestrator/gates";
import { createLlmClient } from "@/lib/llm/client";
import {
  buildEvidencePlannerSystemPrompt,
  buildEvidencePlannerUserPrompt,
  EVIDENCE_PLANNER_PROMPT_VERSION,
} from "@/lib/llm/prompts/evidence-planner";
import {
  evidencePlanSchema,
  type EvidencePlanOutput,
  type EvidenceTool,
} from "@/lib/llm/schemas/evidence-planner";

export interface EvidencePlannerInput {
  vendorRaw: string;
  memo?: string;
  amount: string;
  currency: string;
  vendorId: string | null;
  isNewVendor: boolean;
  ruleHit: boolean;
  ruleGlAccountId?: string;
  labeledCorpusCount: number;
  policyOutcome: PolicyOutcome;
  receiptBlocked: boolean;
  coaAllowList: Set<string>;
}

export interface EvidencePlan {
  tools: EvidenceTool[];
  rationale: string;
  source: "llm" | "fallback";
}

const FALLBACK_TOOLS: EvidenceTool[] = ["vendor_rules", "similar_transactions"];

/**
 * Returns the default evidence plan when the planner LLM fails or live calls are off.
 *
 * @returns Fallback tool list with vendor rules and similar transactions.
 */
export function buildFallbackEvidencePlan(): EvidencePlan {
  return {
    tools: [...FALLBACK_TOOLS],
    rationale: "Fallback plan — vendor rules and similar transactions.",
    source: "fallback",
  };
}

/**
 * Builds a deterministic evidence plan for fixture mode without an LLM call.
 *
 * @param input - Transaction and policy context for planning.
 * @returns Heuristic evidence plan aligned with Phase 1 retrieval policy.
 */
export function buildHeuristicEvidencePlan(input: EvidencePlannerInput): EvidencePlan {
  const tools: EvidenceTool[] = ["vendor_rules"];

  const maySkipRetrieval =
    input.ruleHit &&
    input.ruleGlAccountId !== undefined &&
    isGlInCoaAllowList(input.ruleGlAccountId, input.coaAllowList) &&
    !input.isNewVendor;

  if (!maySkipRetrieval) {
    tools.push("similar_transactions");
  }

  if (input.receiptBlocked || input.policyOutcome !== "ALLOW") {
    tools.push("policy_context");
  }

  return {
    tools,
    rationale: maySkipRetrieval
      ? "Heuristic plan — vendor rule sufficient; policy context when flagged."
      : "Heuristic plan — retrieval required for weak or new vendor.",
    source: "fallback",
  };
}

/**
 * Applies deterministic safety-net overrides to a planner-produced tool list.
 *
 * @param plan - Raw planner output before overrides.
 * @param input - Transaction and policy context.
 * @returns Plan with required tools enforced per agentic v2 §4.3.
 */
export function applyEvidencePlanOverrides(
  plan: Pick<EvidencePlan, "tools" | "rationale" | "source">,
  input: EvidencePlannerInput,
): EvidencePlan {
  const tools = new Set<EvidenceTool>(plan.tools);

  if (input.vendorId) {
    tools.add("vendor_rules");
  }

  if (input.isNewVendor) {
    tools.add("similar_transactions");
  }

  if (input.receiptBlocked || input.policyOutcome === "FLAG_RECEIPT") {
    tools.add("policy_context");
  }

  const ruleGlValid =
    input.ruleHit &&
    input.ruleGlAccountId !== undefined &&
    isGlInCoaAllowList(input.ruleGlAccountId, input.coaAllowList);

  if (ruleGlValid && !input.isNewVendor) {
    tools.delete("similar_transactions");
  }

  if (tools.size === 0) {
    tools.add("vendor_rules");
    tools.add("similar_transactions");
  }

  return {
    tools: [...tools],
    rationale: plan.rationale,
    source: plan.source,
  };
}

/**
 * Plans which evidence tools to run before GL tagging (one structured LLM call).
 *
 * @param env - Application environment.
 * @param input - Transaction, rule, and policy context.
 * @returns Evidence plan with tool ids and rationale.
 */
export async function planEvidence(
  env: AppEnv,
  input: EvidencePlannerInput,
): Promise<EvidencePlan> {
  if (!env.LLM_ENABLE_LIVE_CALLS) {
    return applyEvidencePlanOverrides(buildHeuristicEvidencePlan(input), input);
  }

  const llm = createLlmClient(env);

  try {
    const result = await llm.generateStructuredJson<EvidencePlanOutput>({
      systemPrompt: buildEvidencePlannerSystemPrompt(),
      userPrompt: buildEvidencePlannerUserPrompt({
        vendorRaw: input.vendorRaw,
        memo: input.memo,
        amount: input.amount,
        currency: input.currency,
        isNewVendor: input.isNewVendor,
        ruleHit: input.ruleHit,
        ruleGlAccountId: input.ruleGlAccountId,
        labeledCorpusCount: input.labeledCorpusCount,
        policyOutcome: input.policyOutcome,
        receiptBlocked: input.receiptBlocked,
      }),
      schema: evidencePlanSchema,
      promptVersion: EVIDENCE_PLANNER_PROMPT_VERSION,
    });

    return applyEvidencePlanOverrides(
      { tools: result.data.tools, rationale: result.data.rationale, source: "llm" },
      input,
    );
  } catch {
    return applyEvidencePlanOverrides(buildFallbackEvidencePlan(), input);
  }
}

/**
 * Returns whether similar-transaction retrieval should run for the given plan.
 *
 * @param plan - Final evidence plan after overrides.
 * @returns True when pgvector retrieval is selected.
 */
export function shouldRetrieveFromPlan(plan: EvidencePlan): boolean {
  return plan.tools.includes("similar_transactions");
}
