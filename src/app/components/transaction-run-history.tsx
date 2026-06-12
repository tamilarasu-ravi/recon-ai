"use client";

import Link from "next/link";

import { TransactionRunTrace, type TransactionRunAudit } from "@/app/components/transaction-run-trace";
import { DecisionBadge } from "@/app/components/ui/decision-badge";
import {
  formatEventRunLabel,
  type TransactionEventRunGroup,
} from "@/lib/ui/group-transaction-events";
import { mergeTransactionRuns } from "@/lib/ui/merge-transaction-runs";

interface TransactionRunHistoryProps {
  eventRuns: TransactionEventRunGroup[];
  auditTrail: TransactionRunAudit[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onViewPipelineSteps: (runId: string) => void;
}

/**
 * Unified run history — run picker, graph audit trace, and domain events in one panel.
 *
 * @param props - Grouped events, audit rows, selection, and pipeline modal callback.
 * @returns Run history section or empty state.
 */
export function TransactionRunHistory({
  eventRuns,
  auditTrail,
  selectedRunId,
  onSelectRun,
  onViewPipelineSteps,
}: TransactionRunHistoryProps): React.ReactElement {
  const mergedRuns = mergeTransactionRuns(eventRuns, auditTrail);

  if (mergedRuns.length === 0) {
    return (
      <section className="panel detail-grid__full" style={{ marginBottom: "1.25rem" }}>
        <h2 className="panel__title">Run history</h2>
        <p className="panel__desc">No processing runs recorded for this expense yet.</p>
      </section>
    );
  }

  return (
    <section id="run-trace" className="panel detail-grid__full" style={{ marginBottom: "1.25rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <h2 className="panel__title" style={{ margin: 0 }}>
            Run history
          </h2>
          <p className="panel__desc" style={{ marginBottom: 0, marginTop: "0.35rem" }}>
            Each pass through policy and tagging. Select a run for audit detail and domain events.
          </p>
        </div>
        <Link
          href="/orchestrator"
          className="btn btn--secondary"
          style={{ padding: "0.35rem 0.65rem", fontSize: "0.8125rem" }}
        >
          Workflow diagram
        </Link>
      </div>

      <ul className="run-history-list">
        {mergedRuns.map((run) => {
          const label = formatEventRunLabel(run.events.map((event) => event.eventType));
          const isOpen = run.runId === selectedRunId;
          const auditRow = auditTrail.find((row) => row.runId === run.runId) ?? null;

          return (
            <li
              key={run.runId}
              className={`run-history-item${isOpen ? " run-history-item--open" : ""}`}
            >
              <div className="run-history-item__head">
                <button
                  type="button"
                  className="run-history-item__select"
                  onClick={() => onSelectRun(run.runId)}
                  aria-expanded={isOpen}
                >
                  <span className="run-history-item__label">{label || "Processing run"}</span>
                  <span className="run-history-item__meta">
                    {run.audit?.decision ? (
                      <DecisionBadge decision={run.audit.decision} />
                    ) : null}
                    {run.audit?.confidence ? (
                      <span className="run-history-item__confidence">
                        {run.audit.confidence}
                      </span>
                    ) : null}
                    <code>{run.runId.slice(0, 8)}…</code>
                    <time dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn--secondary run-history-item__steps-btn"
                  onClick={() => onViewPipelineSteps(run.runId)}
                >
                  Pipeline steps
                </button>
              </div>

              {isOpen ? (
                <div className="run-history-item__body">
                  <TransactionRunTrace audit={auditRow} runEvents={run.events} embedded />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
