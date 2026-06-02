import { formatReasonLabel, reasonChipColor } from "@/lib/ui/reason-labels";

interface ReasonBadgeProps {
  reason: string;
}

/**
 * Renders a review-queue reason chip with semantic background color.
 *
 * @param props - Machine reason code.
 * @returns Styled badge span.
 */
export function ReasonBadge({ reason }: ReasonBadgeProps): React.ReactElement {
  return (
    <span
      className="badge badge--reason"
      style={{ background: reasonChipColor(reason), color: "#334155", borderColor: "transparent" }}
    >
      {formatReasonLabel(reason)}
    </span>
  );
}
