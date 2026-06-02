import { Annotation } from "@langchain/langgraph";

import type { PolicyEvaluationResult } from "@/lib/agents/policy/types";
import type { TaggingAgentResult } from "@/lib/agents/tagging/run-tagging-agent";
import type { TaggingDecision } from "@/lib/orchestrator/gates";
import type { GraphStepRecord } from "@/lib/orchestrator/langgraph/trace-step";

/**
 * LangGraph state for the policy → tagging workflow.
 * Orchestrator nodes read/write these fields; agents return structured payloads only.
 */
export const TaggingGraphState = Annotation.Root({
  runId: Annotation<string>,
  tenantId: Annotation<string>,
  transactionId: Annotation<string>,
  vendorRaw: Annotation<string>,
  memo: Annotation<string | undefined>,
  amount: Annotation<string>,
  currency: Annotation<string>,
  mcc: Annotation<string | undefined>,
  policyResult: Annotation<PolicyEvaluationResult | null>,
  receiptBlocked: Annotation<boolean>,
  taggingResult: Annotation<TaggingAgentResult | null>,
  finalDecision: Annotation<TaggingDecision | null>,
  finalReason: Annotation<string | null>,
  mode: Annotation<"ingest" | "reprocess">,
  graphSteps: Annotation<GraphStepRecord[]>({
    reducer: (left, right) =>
      left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
});

export type TaggingGraphStateType = typeof TaggingGraphState.State;
