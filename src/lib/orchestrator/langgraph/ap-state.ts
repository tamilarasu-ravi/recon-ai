import { Annotation } from "@langchain/langgraph";

import type { ApRecommendationWithForecast } from "@/lib/agents/ap/recommend-with-forecast";
import type { GraphStepRecord } from "@/lib/orchestrator/langgraph/trace-step";

/**
 * LangGraph state for the AP invoice ingest workflow.
 */
export const ApGraphState = Annotation.Root({
  runId: Annotation<string>,
  tenantId: Annotation<string>,
  externalInvoiceId: Annotation<string>,
  vendorRaw: Annotation<string>,
  amount: Annotation<string>,
  currency: Annotation<string>,
  invoiceDateIso: Annotation<string>,
  duplicateFound: Annotation<boolean>,
  duplicateInvoiceId: Annotation<string | null>,
  duplicateExternalId: Annotation<string | null>,
  invoiceId: Annotation<string | null>,
  recommendation: Annotation<ApRecommendationWithForecast | null>,
  status: Annotation<"accepted" | "duplicate" | null>,
  graphSteps: Annotation<GraphStepRecord[]>({
    reducer: (left, right) =>
      left.concat(Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
});

export type ApGraphStateType = typeof ApGraphState.State;
