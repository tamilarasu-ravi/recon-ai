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
