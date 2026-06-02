/**
 * One executed LangGraph node recorded for audit and UI trace.
 */
export interface GraphStepRecord {
  node: string;
  latency_ms: number;
  status: "ok" | "skipped" | "error";
}

/**
 * Builds a partial state update appending a completed graph node step.
 *
 * @param node - LangGraph node name.
 * @param startedAtMs - Date.now() captured at node entry.
 * @param status - Execution status for the step.
 * @returns Partial state with graphSteps array for reducer merge.
 */
export function traceGraphStep(
  node: string,
  startedAtMs: number,
  status: GraphStepRecord["status"] = "ok",
): { graphSteps: GraphStepRecord[] } {
  return {
    graphSteps: [
      {
        node,
        latency_ms: Date.now() - startedAtMs,
        status,
      },
    ],
  };
}
