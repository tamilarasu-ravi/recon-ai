import { decisionBadgeClass } from "@/lib/ui/decision-styles";

interface DecisionBadgeProps {
  decision: string | null | undefined;
}

/**
 * Renders a semantic badge for AUTO_TAG, QUEUE_REVIEW, or REFUSE.
 *
 * @param props - Tagging decision from transaction or queue item.
 * @returns Styled decision badge.
 */
export function DecisionBadge({ decision }: DecisionBadgeProps): React.ReactElement | null {
  if (!decision) {
    return null;
  }

  return <span className={decisionBadgeClass(decision)}>{decision.replace("_", " ")}</span>;
}
