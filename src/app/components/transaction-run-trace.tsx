"use client";

import { GraphStepsTimeline } from "@/app/components/graph-steps-timeline";
import { DecisionBadge } from "@/app/components/ui/decision-badge";
import type { TransactionEventRow } from "@/lib/ui/group-transaction-events";
import { parseObservability } from "@/lib/ui/parse-audit";

export interface TransactionRunAudit {
  runId: string;
  agent: string;
  decision: string | null;
  confidence: string | null;
  policyVersion: string | null;
  observability: unknown;
  createdAt: string;
}

interface TransactionRunTraceProps {
  audit: TransactionRunAudit | null;
  runEvents: TransactionEventRow[];
  /** When true, omits outer spacing for embedding inside run history cards. */
  embedded?: boolean;
}

/**
 * Renders orchestrator graph steps and audit metadata for one run_id.
 *
 * @param props - Audit row and domain events for the selected run.
 * @returns Trace panel or fallback when audit is missing.
 */
export function TransactionRunTrace({
  audit,
  runEvents,
  embedded = false,
}: TransactionRunTraceProps): React.ReactElement {
  const observability = parseObservability(audit?.observability);

  const llmStep = Array.isArray(observability.steps)
    ? observability.steps.find(
        (step) =>
          typeof step === "object" &&
          step !== null &&
          "name" in step &&
          step.name === "llm_tagging",
      )
    : undefined;
  const llmError =
    llmStep &&
    typeof llmStep === "object" &&
    "detail" in llmStep &&
    llmStep.detail &&
    typeof llmStep.detail === "object" &&
    "error_message" in llmStep.detail
      ? String(llmStep.detail.error_message)
      : null;

  if (!audit) {
    return (
      <div className={embedded ? "run-history-item__trace" : undefined}>
        <p className="panel__desc">No audit trace stored for this run.</p>
        {runEvents.length > 0 ? (
          <DomainEventsList events={runEvents} />
        ) : (
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
            No domain events recorded.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={embedded ? "run-history-item__trace" : undefined}>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", margin: "0 0 0.75rem" }}>
        {audit.policyVersion ? `Policy version ${audit.policyVersion}` : null}
        {audit.decision ? (
          <>
            {audit.policyVersion ? " · " : null}
            <DecisionBadge decision={audit.decision} />
          </>
        ) : null}
        {audit.confidence ? ` · confidence ${audit.confidence}` : null}
      </p>

      {observability.llm_skipped ? (
        <p className="alert alert--info" style={{ marginBottom: "0.75rem" }}>
          <strong>Used vendor rule:</strong>{" "}
          {observability.llm_skipped_reason ?? "matched a saved vendor rule"}
        </p>
      ) : observability.llm_skipped === false ? (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
          AI suggestion used for account coding.
        </p>
      ) : null}

      {typeof observability.cost_usd === "number" ||
      typeof observability.prompt_tokens === "number" ? (
        <div className="stat-grid" style={{ marginBottom: "0.75rem" }}>
          <div className="stat">
            <span className="stat__label">Est. cost</span>
            <span className="stat__value">
              {(() => {
                const cost = observability.cost_usd ?? 0;
                return `$${cost.toFixed(cost < 0.01 ? 4 : 2)}`;
              })()}
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Prompt tokens</span>
            <span className="stat__value">{observability.prompt_tokens ?? 0}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Completion tokens</span>
            <span className="stat__value">{observability.completion_tokens ?? 0}</span>
          </div>
          {observability.model ? (
            <div className="stat">
              <span className="stat__label">Model</span>
              <span className="stat__value" style={{ fontSize: "0.8125rem" }}>
                {observability.model}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {llmError ? <p className="alert alert--error">{llmError}</p> : null}
      {observability.policy_outcome ? (
        <p style={{ fontSize: "0.875rem", margin: "0.5rem 0" }}>
          Policy outcome: <strong>{observability.policy_outcome}</strong>
        </p>
      ) : null}
      {observability.receipt_blocked ? (
        <p className="alert alert--error" style={{ marginTop: "0.5rem" }}>
          Receipt required before this expense can be auto-coded.
        </p>
      ) : null}
      {observability.reason ? (
        <p style={{ fontSize: "0.875rem", margin: "0.5rem 0" }}>
          Reason: <strong>{observability.reason}</strong>
        </p>
      ) : null}

      {Array.isArray(observability.graph_steps) && observability.graph_steps.length > 0 ? (
        <GraphStepsTimeline steps={observability.graph_steps} />
      ) : null}

      {runEvents.length > 0 ? (
        <details className="details-scroll" style={{ marginTop: embedded ? "0.75rem" : "1rem" }} open={embedded}>
          <summary className="details-summary">Domain events ({runEvents.length})</summary>
          <DomainEventsList events={runEvents} />
        </details>
      ) : null}

      {Array.isArray(observability.steps) && observability.steps.length > 0 ? (
        <details className="details-scroll" style={{ marginTop: "1rem" }}>
          <summary className="details-summary">Technical trace ({observability.steps.length})</summary>
          <pre className="code-block">{JSON.stringify(observability.steps, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Renders domain event payloads for one orchestrator run.
 *
 * @param props - Event rows for the selected run_id.
 * @returns Ordered event list.
 */
function DomainEventsList({
  events,
}: {
  events: TransactionEventRow[];
}): React.ReactElement {
  return (
    <ul className="api-list" style={{ marginTop: "0.5rem" }}>
      {events.map((event, index) => (
        <li key={`${event.eventType}-${index}`}>
          <strong>{event.eventType}</strong>
          <span style={{ marginLeft: "0.5rem", fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
            {new Date(event.createdAt).toLocaleString()}
          </span>
          <pre className="code-block code-block--light" style={{ marginTop: "0.35rem" }}>
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </li>
      ))}
    </ul>
  );
}
