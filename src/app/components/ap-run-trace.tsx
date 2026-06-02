"use client";

import { GraphStepsTimeline } from "@/app/components/graph-steps-timeline";
import { parseObservability } from "@/lib/ui/parse-audit";

export interface ApRunAudit {
  runId: string;
  agent: string;
  observability: unknown;
  createdAt: string;
}

export interface ApDomainEvent {
  eventType: string;
  runId: string;
  payload: unknown;
  createdAt: string;
}

interface ApRunTraceProps {
  audit: ApRunAudit | null;
  events: ApDomainEvent[];
}

/**
 * Renders AP LangGraph steps and domain events for one orchestrator run.
 *
 * @param props - Audit row and events for the invoice run.
 * @returns Trace panel or fallback when audit is missing.
 */
export function ApRunTrace({ audit, events }: ApRunTraceProps): React.ReactElement {
  const observability = parseObservability(audit?.observability);
  const apMeta = observability as AuditObservabilityAp;

  if (!audit) {
    return (
      <div>
        <p className="panel__desc">No audit trace for this run. Domain events:</p>
        <ul className="api-list">
          {events.map((event, index) => (
            <li key={`${event.eventType}-${index}`}>
              <strong>{event.eventType}</strong>
              <pre className="code-block code-block--light" style={{ marginTop: "0.5rem" }}>
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", margin: "0 0 0.75rem" }}>
        run_id: <code>{audit.runId}</code> · agent {audit.agent}
      </p>

      {apMeta.status ? (
        <p style={{ fontSize: "0.875rem", margin: "0 0 0.5rem" }}>
          Status: <strong>{apMeta.status}</strong>
        </p>
      ) : null}
      {apMeta.funding_source ? (
        <p style={{ fontSize: "0.875rem", margin: "0 0 0.5rem" }}>
          Funding: <strong>{apMeta.funding_source}</strong>
        </p>
      ) : null}
      {apMeta.recommended_pay_date ? (
        <p style={{ fontSize: "0.875rem", margin: "0 0 0.5rem" }}>
          Recommended pay date:{" "}
          <strong>{new Date(apMeta.recommended_pay_date).toLocaleDateString()}</strong>
        </p>
      ) : null}
      {apMeta.rationale ? (
        <p className="alert alert--info" style={{ marginBottom: "0.75rem" }}>
          {apMeta.rationale}
        </p>
      ) : null}
      {apMeta.duplicate_of ? (
        <p className="alert alert--warning" style={{ marginBottom: "0.75rem" }}>
          Duplicate of external id: <code>{apMeta.duplicate_of}</code>
        </p>
      ) : null}

      {Array.isArray(observability.graph_steps) && observability.graph_steps.length > 0 ? (
        <GraphStepsTimeline steps={observability.graph_steps} />
      ) : null}

      {events.length > 0 ? (
        <details className="details-scroll" style={{ marginTop: "1rem" }}>
          <summary className="details-summary">Domain events ({events.length})</summary>
          <ul className="api-list" style={{ marginTop: "0.5rem" }}>
            {events.map((event, index) => (
              <li key={`${event.eventType}-${index}`}>
                <strong>{event.eventType}</strong>
                <pre className="code-block code-block--light" style={{ marginTop: "0.35rem" }}>
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

interface AuditObservabilityAp {
  status?: string;
  rationale?: string;
  funding_source?: string;
  recommended_pay_date?: string;
  duplicate_of?: string;
  external_invoice_id?: string;
}
