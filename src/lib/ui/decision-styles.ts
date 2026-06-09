/**
 * Maps tagging decision codes to finance-friendly display labels.
 *
 * @param decision - Tagging decision string from API.
 * @returns User-facing label for badges and summaries.
 */
export function formatDecisionLabel(decision: string | null | undefined): string {
  switch (decision) {
    case "AUTO_TAG":
      return "Auto-coded";
    case "QUEUE_REVIEW":
      return "Needs review";
    case "REFUSE":
      return "Unclassified";
    default:
      return decision?.replace(/_/g, " ") ?? "";
  }
}

/**
 * Maps tagging decision codes to badge CSS class names.
 *
 * @param decision - Tagging decision string from API.
 * @returns CSS class for decision badge styling.
 */
export function decisionBadgeClass(decision: string | null | undefined): string {
  switch (decision) {
    case "AUTO_TAG":
      return "badge badge--auto";
    case "QUEUE_REVIEW":
      return "badge badge--review";
    case "REFUSE":
      return "badge badge--refuse";
    default:
      return "badge";
  }
}
