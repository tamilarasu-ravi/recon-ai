import { formatGraphNodeLabel, type GraphStepRecord } from "@/lib/ui/parse-audit";

interface GraphStepsTimelineProps {
  steps: GraphStepRecord[];
  title?: string;
}

/**
 * Renders LangGraph node execution order with per-node latency.
 *
 * @param props - Graph step records from audit observability.
 * @returns Timeline element or null when empty.
 */
export function GraphStepsTimeline({
  steps,
  title = "LangGraph orchestrator",
}: GraphStepsTimelineProps): React.ReactElement | null {
  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="graph-timeline">
      <p className="graph-timeline__title">{title}</p>
      <div className="graph-timeline__track">
        {steps.map((step, index) => (
          <span key={`${step.node}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            {index > 0 ? <span className="graph-arrow">→</span> : null}
            <span className="graph-step" title={`${step.status} · ${step.latency_ms}ms`}>
              {formatGraphNodeLabel(step.node)}
              <span className="graph-step__latency">{step.latency_ms}ms</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
