import { Command, END, START, StateGraph } from "@langchain/langgraph";

import type { AppEnv } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";
import { getOrchestratorCheckpointer } from "@/lib/orchestrator/langgraph/checkpointer";
import { taggingGraphContextSchema } from "@/lib/orchestrator/langgraph/context";
import {
  parseTaggingInterrupt,
  type TaggingGraphInvokeResult,
} from "@/lib/orchestrator/langgraph/invoke-result";
import {
  applyPolicyCapNode,
  awaitAutoTagApprovalNode,
  checkReceiptNode,
  evaluatePolicyNode,
  persistIngestOutcomeNode,
  persistReprocessOutcomeNode,
  routePersistNode,
  runTaggingNode,
} from "@/lib/orchestrator/langgraph/tagging-nodes";
import {
  TaggingGraphState,
  type TaggingGraphStateType,
} from "@/lib/orchestrator/langgraph/tagging-state";

export interface InvokeTaggingGraphInput {
  runId: string;
  tenantId: string;
  transactionId: string;
  vendorRaw: string;
  memo?: string;
  amount: string;
  currency: string;
  mcc?: string;
}

export interface InvokeTaggingGraphOptions {
  skipPolicy?: boolean;
  skipHitl?: boolean;
  hitlEnabled?: boolean;
  mode?: "ingest" | "reprocess";
}

type CompiledTaggingGraph = Awaited<ReturnType<typeof buildTaggingGraph>>;

let compiledTaggingGraph: CompiledTaggingGraph | null = null;
let compilePromise: Promise<CompiledTaggingGraph> | null = null;

/**
 * Builds and compiles the LangGraph workflow for policy → tagging → optional HITL.
 *
 * @param checkpointer - Postgres or memory checkpointer instance.
 * @returns Compiled StateGraph ready for invoke.
 */
async function buildTaggingGraph() {
  const checkpointer = await getOrchestratorCheckpointer();

  return new StateGraph(TaggingGraphState, taggingGraphContextSchema)
    .addNode("evaluatePolicy", evaluatePolicyNode)
    .addNode("checkReceipt", checkReceiptNode)
    .addNode("runTagging", runTaggingNode)
    .addNode("applyPolicyCap", applyPolicyCapNode)
    .addNode("awaitAutoTagApproval", awaitAutoTagApprovalNode)
    .addNode("persistIngestOutcome", persistIngestOutcomeNode)
    .addNode("persistReprocessOutcome", persistReprocessOutcomeNode)
    .addEdge(START, "evaluatePolicy")
    .addEdge("evaluatePolicy", "checkReceipt")
    .addEdge("checkReceipt", "runTagging")
    .addEdge("runTagging", "applyPolicyCap")
    .addEdge("applyPolicyCap", "awaitAutoTagApproval")
    .addConditionalEdges("awaitAutoTagApproval", routePersistNode)
    .addEdge("persistIngestOutcome", END)
    .addEdge("persistReprocessOutcome", END)
    .compile({ checkpointer });
}

/**
 * Returns the singleton compiled tagging graph instance.
 *
 * @returns Compiled LangGraph workflow.
 */
export async function getTaggingGraph(): Promise<CompiledTaggingGraph> {
  if (compiledTaggingGraph) {
    return compiledTaggingGraph;
  }

  if (!compilePromise) {
    compilePromise = buildTaggingGraph().then((graph) => {
      compiledTaggingGraph = graph;
      return graph;
    });
  }

  return compilePromise;
}

/**
 * Builds runtime context for tagging graph invoke/resume calls.
 *
 * @param db - Database client.
 * @param env - Application environment.
 * @param options - skipPolicy, skipHitl, hitlEnabled, mode.
 * @returns Context object passed to graph.invoke.
 */
function buildTaggingRuntimeContext(
  db: DbClient,
  env: AppEnv,
  options?: InvokeTaggingGraphOptions,
) {
  const baseHitl =
    options?.hitlEnabled !== undefined
      ? options.hitlEnabled
      : env.AUTO_TAG_HITL_ENABLED && (options?.mode ?? "ingest") !== "reprocess";

  return {
    db,
    env,
    skipPolicy: options?.skipPolicy ?? false,
    hitlEnabled: baseHitl && !(options?.skipHitl ?? false),
    mode: options?.mode ?? "ingest",
  };
}

/**
 * Invokes the LangGraph tagging workflow with runtime db/env context.
 *
 * @param db - Drizzle database client.
 * @param env - Validated application environment.
 * @param input - Transaction fields required by graph nodes.
 * @param options - skipPolicy for eval; skipHitl for demo/eval; mode for ingest vs reprocess.
 * @returns Graph state plus interrupt metadata when HITL pauses before AUTO_TAG.
 */
export async function invokeTaggingGraph(
  db: DbClient,
  env: AppEnv,
  input: InvokeTaggingGraphInput,
  options?: InvokeTaggingGraphOptions,
): Promise<TaggingGraphInvokeResult> {
  const graph = await getTaggingGraph();
  const initialState: Partial<TaggingGraphStateType> = {
    ...input,
    policyResult: null,
    receiptBlocked: false,
    taggingResult: null,
    finalDecision: null,
    finalReason: null,
    mode: options?.mode ?? "ingest",
    graphSteps: [],
  };

  const rawResult = await graph.invoke(initialState, {
    context: buildTaggingRuntimeContext(db, env, options),
    configurable: { thread_id: input.runId },
  });

  const interruptPayload = parseTaggingInterrupt(
    rawResult as TaggingGraphStateType & { __interrupt__?: Array<{ value: unknown }> },
  );

  return {
    state: rawResult as TaggingGraphStateType,
    interrupted: Boolean(interruptPayload),
    interruptPayload,
  };
}

/**
 * Resumes a paused tagging graph after AUTO_TAG human approval decision.
 *
 * @param db - Drizzle database client.
 * @param env - Validated application environment.
 * @param runId - Original run_id / LangGraph thread_id.
 * @param approved - Whether the human approved AUTO_TAG posting.
 * @param options - Runtime options (mode should match original invoke).
 * @returns Updated graph invoke result after resume completes or re-interrupts.
 */
export async function resumeTaggingGraph(
  db: DbClient,
  env: AppEnv,
  runId: string,
  approved: boolean,
  options?: Pick<InvokeTaggingGraphOptions, "skipPolicy" | "skipHitl" | "hitlEnabled" | "mode">,
): Promise<TaggingGraphInvokeResult> {
  const graph = await getTaggingGraph();

  const rawResult = await graph.invoke(new Command({ resume: approved }), {
    context: buildTaggingRuntimeContext(db, env, { ...options, mode: options?.mode ?? "ingest" }),
    configurable: { thread_id: runId },
  });

  const interruptPayload = parseTaggingInterrupt(
    rawResult as TaggingGraphStateType & { __interrupt__?: Array<{ value: unknown }> },
  );

  return {
    state: rawResult as TaggingGraphStateType,
    interrupted: Boolean(interruptPayload),
    interruptPayload,
  };
}

/**
 * Resets the compiled graph singleton (for tests only).
 */
export function resetTaggingGraphForTests(): void {
  compiledTaggingGraph = null;
  compilePromise = null;
}
