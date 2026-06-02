/** Human-readable labels for review-queue and gate reason codes. */
const REASON_LABELS: Record<string, string> = {
  receipt_required: "Receipt required",
  policy_flag_review: "Policy review",
  prompt_injection_guard: "Safety — prompt injection",
  new_vendor_cold_start: "New vendor (cold start)",
  llm_parse_failed: "LLM parse failed",
  llm_unavailable: "LLM unavailable",
  low_confidence: "Low confidence",
  refuse_low_similarity: "Low similarity — refused",
  refuse_out_of_coa: "Out of chart of accounts",
  review_only_gl: "Review-only GL",
  unknown_vendor_pattern: "Unknown vendor — refused",
};

/**
 * Maps an internal reason code to a short display label.
 *
 * @param reason - Machine reason from review_queue or gates.
 * @returns Label for UI chips.
 */
export function formatReasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

/**
 * Returns a background color for a reason chip by category.
 *
 * @param reason - Machine reason code.
 * @returns CSS color string.
 */
export function reasonChipColor(reason: string): string {
  if (reason.includes("receipt")) return "#fef3c7";
  if (reason.includes("refuse") || reason.includes("injection")) return "#fee2e2";
  if (reason.includes("policy") || reason.includes("vendor")) return "#e0e7ff";
  return "#f3f4f6";
}
