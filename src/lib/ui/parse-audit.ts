export interface GraphStepRecord {
  node: string;
  latency_ms: number;
  status: "ok" | "skipped" | "error";
}

export interface AuditObservability {
  steps?: unknown[];
  graph_steps?: GraphStepRecord[];
  orchestrator?: string;
  llm_skipped?: boolean;
  llm_skipped_reason?: string;
  reason?: string;
  policy_outcome?: string;
  receipt_blocked?: boolean;
  suggested_gl_account_id?: string;
  cost_usd?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  model?: string;
  prompt_version?: string;
}

/**
 * Safely parses audit observability JSON from the database.
 *
 * @param value - Raw JSON column value.
 * @returns Parsed observability object or empty object when invalid.
 */
export function parseObservability(value: unknown): AuditObservability {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as AuditObservability;
}

/**
 * Formats a LangGraph node name for display (camelCase → spaced label).
 *
 * @param node - Raw node identifier from graph_steps.
 * @returns Human-readable label.
 */
export function formatGraphNodeLabel(node: string): string {
  return node
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}
