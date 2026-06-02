import type { TaggingGraphStateType } from "@/lib/orchestrator/langgraph/tagging-state";
import type { TaggingDecision } from "@/lib/orchestrator/gates";

export interface AutoTagInterruptPayload {
  type: "auto_tag_approval";
  transaction_id: string;
  run_id: string;
  proposed_decision: TaggingDecision;
  confidence: number | null;
  vendor_raw: string;
  amount: string;
  currency: string;
}

export interface TaggingGraphInvokeResult {
  state: TaggingGraphStateType;
  interrupted: boolean;
  interruptPayload?: AutoTagInterruptPayload;
}

/**
 * Extracts LangGraph __interrupt__ payloads from an invoke result.
 *
 * @param result - Raw graph.invoke return value.
 * @returns Parsed auto-tag interrupt payload when present.
 */
export function parseTaggingInterrupt(
  result: TaggingGraphStateType & { __interrupt__?: Array<{ value: unknown }> },
): AutoTagInterruptPayload | undefined {
  const interrupts = result.__interrupt__;
  if (!interrupts?.length) {
    return undefined;
  }

  const first = interrupts[0]?.value;
  if (!first || typeof first !== "object") {
    return undefined;
  }

  const payload = first as Partial<AutoTagInterruptPayload>;
  if (payload.type !== "auto_tag_approval") {
    return undefined;
  }

  return payload as AutoTagInterruptPayload;
}
