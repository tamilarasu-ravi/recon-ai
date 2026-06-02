import { END, START, StateGraph } from "@langchain/langgraph";

import type { DbClient } from "@/lib/db/client";
import { getOrchestratorCheckpointer } from "@/lib/orchestrator/langgraph/checkpointer";
import { apGraphContextSchema } from "@/lib/orchestrator/langgraph/context";
import {
  checkApDuplicateNode,
  ingestApInvoiceNode,
  persistApDuplicateRefusalNode,
  persistApRecommendationNode,
  recommendApNode,
  routeApAfterDuplicateCheck,
} from "@/lib/orchestrator/langgraph/ap-nodes";
import { ApGraphState, type ApGraphStateType } from "@/lib/orchestrator/langgraph/ap-state";

export interface InvokeApGraphInput {
  runId: string;
  tenantId: string;
  externalInvoiceId: string;
  vendorRaw: string;
  amount: string;
  currency: string;
  invoiceDateIso: string;
}

type CompiledApGraph = Awaited<ReturnType<typeof buildApGraph>>;

let compiledApGraph: CompiledApGraph | null = null;
let apCompilePromise: Promise<CompiledApGraph> | null = null;

/**
 * Builds and compiles the LangGraph AP invoice workflow.
 *
 * @returns Compiled StateGraph ready for invoke.
 */
async function buildApGraph() {
  const checkpointer = await getOrchestratorCheckpointer();

  return new StateGraph(ApGraphState, apGraphContextSchema)
    .addNode("checkApDuplicate", checkApDuplicateNode)
    .addNode("persistApDuplicateRefusal", persistApDuplicateRefusalNode)
    .addNode("ingestApInvoice", ingestApInvoiceNode)
    .addNode("recommendAp", recommendApNode)
    .addNode("persistApRecommendation", persistApRecommendationNode)
    .addEdge(START, "checkApDuplicate")
    .addConditionalEdges("checkApDuplicate", routeApAfterDuplicateCheck)
    .addEdge("persistApDuplicateRefusal", END)
    .addEdge("ingestApInvoice", "recommendAp")
    .addEdge("recommendAp", "persistApRecommendation")
    .addEdge("persistApRecommendation", END)
    .compile({ checkpointer });
}

/**
 * Returns the singleton compiled AP graph instance.
 *
 * @returns Compiled LangGraph AP workflow.
 */
export async function getApGraph(): Promise<CompiledApGraph> {
  if (compiledApGraph) {
    return compiledApGraph;
  }

  if (!apCompilePromise) {
    apCompilePromise = buildApGraph().then((graph) => {
      compiledApGraph = graph;
      return graph;
    });
  }

  return apCompilePromise;
}

/**
 * Invokes the LangGraph AP workflow with runtime db context.
 *
 * @param db - Drizzle database client.
 * @param input - Invoice ingest fields.
 * @returns Final graph state after workflow completes.
 */
export async function invokeApGraph(
  db: DbClient,
  input: InvokeApGraphInput,
): Promise<ApGraphStateType> {
  const graph = await getApGraph();
  const initialState: Partial<ApGraphStateType> = {
    ...input,
    duplicateFound: false,
    duplicateInvoiceId: null,
    duplicateExternalId: null,
    invoiceId: null,
    recommendation: null,
    status: null,
    graphSteps: [],
  };

  return graph.invoke(initialState, {
    context: { db },
    configurable: { thread_id: input.runId },
  });
}

/**
 * Resets the compiled AP graph singleton (for tests only).
 */
export function resetApGraphForTests(): void {
  compiledApGraph = null;
  apCompilePromise = null;
}
