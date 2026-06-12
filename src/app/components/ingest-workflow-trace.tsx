"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

import { DecisionBadge } from "@/app/components/ui/decision-badge";
import type { PipelineTraceStepPayload } from "@/lib/pipeline/trace-step";
import {
  getPipelineTraceStatusLabel,
  normalizePipelineTraceStepsForDisplay,
  PHASE_HANDOFF_DETAIL_KEY,
} from "@/lib/ui/normalize-pipeline-trace-steps";
import { usePipelineTraceStream } from "@/lib/ui/use-pipeline-trace-stream";

export interface PipelineWorkflowTraceProps {
  tenantId: string;
  transactionId: string;
  runId: string;
  enabled: boolean;
  /** When false, hides the link to transaction detail (use on detail page). */
  showDetailLink?: boolean;
  /** Optional panel title override. */
  title?: string;
  /** When set, footer links scroll to this element id instead of navigating away. */
  auditSectionId?: string;
}

/** @deprecated Use PipelineWorkflowTrace — kept for ingest form imports. */
export type IngestWorkflowTraceProps = PipelineWorkflowTraceProps;

interface RagNeighborRow {
  external_transaction_id?: string | null;
  gl_code?: string | null;
  similarity?: number;
}

/**
 * Renders a live SSE workflow trace for ingest → vector → policy → RAG → LLM.
 *
 * @param props - Transaction ids, stream enable flag, and optional display overrides.
 * @returns Streaming timeline panel.
 */
export function PipelineWorkflowTrace({
  tenantId,
  transactionId,
  runId,
  enabled,
  showDetailLink = true,
  title = "Live pipeline trace",
  auditSectionId,
}: PipelineWorkflowTraceProps): React.ReactElement {
  const { steps, auditSummary, done, decision, confidence, error, connected } =
    usePipelineTraceStream(tenantId, transactionId, runId, enabled);
  const displaySteps = useMemo(
    () => normalizePipelineTraceStepsForDisplay(steps, done),
    [steps, done],
  );
  const listEndRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (steps.length > 0 && !done) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [steps.length, done]);

  const detailHref = `/transactions/${transactionId}?tenant_id=${encodeURIComponent(tenantId)}&run_id=${encodeURIComponent(runId)}`;

  /**
   * Scrolls to the graph audit section when embedded on the transaction detail page.
   */
  function scrollToAuditSection(): void {
    if (!auditSectionId) {
      return;
    }
    document.getElementById(auditSectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="panel workflow-trace" aria-live="polite">
      <div className="workflow-trace__header">
        <h2 className="panel__title" style={{ marginBottom: 0 }}>
          {title}
        </h2>
        <span className={`workflow-trace__live${connected && !done ? " workflow-trace__live--on" : ""}`}>
          {done ? "Complete" : connected ? "Streaming" : "Connecting…"}
        </span>
      </div>
      <p className="panel__desc">
        How each expense was processed — policy checks, similar expense lookup, and the coding
        decision.
      </p>

      {error ? <p className="alert alert--error">{error}</p> : null}

      {auditSummary &&
      (auditSummary.cost_usd !== undefined || auditSummary.prompt_tokens !== undefined) ? (
        <div className="stat-grid" style={{ marginBottom: "1rem" }}>
          <div className="stat">
            <span className="stat__label">Est. LLM cost</span>
            <span className="stat__value">
              ${(auditSummary.cost_usd ?? 0).toFixed((auditSummary.cost_usd ?? 0) < 0.01 ? 4 : 2)}
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Prompt tokens</span>
            <span className="stat__value">{auditSummary.prompt_tokens ?? 0}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Completion tokens</span>
            <span className="stat__value">{auditSummary.completion_tokens ?? 0}</span>
          </div>
          {auditSummary.model ? (
            <div className="stat">
              <span className="stat__label">Model</span>
              <span className="stat__value" style={{ fontSize: "0.8125rem" }}>
                {auditSummary.model}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <ol className="workflow-trace__list">
        {displaySteps.map((step, index) => (
          <WorkflowTraceStepItem key={step.step_id} step={step} index={index} />
        ))}
        {!done && connected && displaySteps.length > 0 ? (
          <li
            ref={listEndRef}
            className="workflow-trace__item workflow-trace__item--pending"
            aria-hidden
          >
            <span className="workflow-trace__pulse" />
            <span className="workflow-trace__pending-text">Waiting for next step…</span>
          </li>
        ) : null}
      </ol>

      {steps.length === 0 && connected && !done ? (
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
          Pipeline started — first trace events incoming…
        </p>
      ) : null}

      {steps.length === 0 && done && !error ? (
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
          No step-by-step trace for this run — it may predate pipeline tracing. Use{" "}
          <strong>Run trace</strong> below for graph audit data.
        </p>
      ) : null}

      {done ? (
        <div className="workflow-trace__footer">
          {decision ? (
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
              Final decision: <DecisionBadge decision={decision} />
              {confidence !== null ? (
                <span style={{ marginLeft: "0.5rem" }}>confidence {confidence.toFixed(4)}</span>
              ) : null}
            </p>
          ) : null}
          {showDetailLink ? (
            <Link href={detailHref} className="btn btn--secondary">
              Full audit trace →
            </Link>
          ) : auditSectionId ? (
            <button type="button" className="btn btn--secondary" onClick={scrollToAuditSection}>
              Graph step trace ↓
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Alias for PipelineWorkflowTrace (ingest form). */
export const IngestWorkflowTrace = PipelineWorkflowTrace;

/**
 * Renders evidence planner step metadata (tools, source, rationale).
 *
 * @param props - Pipeline trace step payload for planner phase.
 * @returns Detail block or null when no planner fields present.
 */
function PlannerTraceDetail({
  step,
}: {
  step: PipelineTraceStepPayload;
}): React.ReactElement | null {
  const detail = step.detail;
  if (!detail) {
    return null;
  }

  const tools = Array.isArray(detail.tools) ? detail.tools.map(String) : [];
  const rationale = typeof detail.rationale === "string" ? detail.rationale : null;
  const source = typeof detail.source === "string" ? detail.source : null;
  const summary = typeof detail.summary === "string" ? detail.summary : null;

  if (tools.length === 0 && !rationale && !summary) {
    return null;
  }

  return (
    <div className="workflow-trace__planner">
      {step.step_id === "evidence-plan" && tools.length > 0 ? (
        <p className="workflow-trace__meta">
          Tools:{" "}
          {tools.map((tool) => (
            <span key={tool} className="badge badge--reason" style={{ marginRight: "0.35rem" }}>
              {tool.replace(/_/g, " ")}
            </span>
          ))}
          {source ? (
            <span style={{ marginLeft: "0.35rem", fontSize: "0.8125rem" }}>
              · source: <strong>{source}</strong>
            </span>
          ) : null}
        </p>
      ) : null}
      {rationale ? (
        <p className="workflow-trace__description" style={{ marginTop: "0.35rem" }}>
          {rationale}
        </p>
      ) : null}
      {summary ? (
        <p className="workflow-trace__meta">
          <code style={{ fontSize: "0.8125rem" }}>{summary}</code>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Renders heuristic verifier concerns from the evidence-verify step.
 *
 * @param props - Step detail object from pipeline trace.
 * @returns Detail block or null when empty.
 */
function VerifierTraceDetail({
  detail,
}: {
  detail: Record<string, unknown>;
}): React.ReactElement | null {
  const concerns = Array.isArray(detail.concerns) ? detail.concerns.map(String) : [];
  const forceReview = detail.force_review === true;
  const reason = typeof detail.reason === "string" ? detail.reason : null;

  if (!forceReview && concerns.length === 0 && !reason) {
    return null;
  }

  return (
    <div className="workflow-trace__verifier">
      {forceReview ? (
        <p className="workflow-trace__meta">
          <span className="badge badge--reason">Force review</span>
          {reason ? <span style={{ marginLeft: "0.5rem" }}>{reason}</span> : null}
        </p>
      ) : null}
      {concerns.length > 0 ? (
        <ul className="workflow-trace__neighbor-list">
          {concerns.map((concern) => (
            <li key={concern}>{concern}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface WorkflowTraceStepItemProps {
  step: PipelineTraceStepPayload;
  index: number;
}

/**
 * Renders one trace step with phase badge, status, and expandable detail.
 *
 * @param props - Step payload and animation index.
 * @returns Timeline list item.
 */
function WorkflowTraceStepItem({ step, index }: WorkflowTraceStepItemProps): React.ReactElement {
  const statusClass =
    step.status === "running"
      ? "workflow-trace__item--running"
      : step.status === "error"
        ? "workflow-trace__item--error"
        : step.status === "skipped"
          ? "workflow-trace__item--skipped"
          : "workflow-trace__item--complete";

  const neighbors = Array.isArray(step.detail?.neighbors)
    ? (step.detail.neighbors as RagNeighborRow[])
    : [];

  const isPhaseHandoff = step.detail?.[PHASE_HANDOFF_DETAIL_KEY] === true;
  const statusLabel = getPipelineTraceStatusLabel(step);

  return (
    <li
      className={`workflow-trace__item ${statusClass}`}
      style={{ animationDelay: `${Math.min(index * 80, 800)}ms` }}
    >
      <div className="workflow-trace__item-head">
        <span className={`workflow-trace__phase workflow-trace__phase--${step.phase}`}>
          {step.phase}
        </span>
        <strong className="workflow-trace__title">{step.title}</strong>
        {step.latency_ms !== undefined ? (
          <span className="workflow-trace__latency">{step.latency_ms}ms</span>
        ) : null}
        <span
          className={`workflow-trace__status workflow-trace__status--${step.status}${
            isPhaseHandoff ? " workflow-trace__status--handoff" : ""
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {step.description ? (
        <p className="workflow-trace__description">{step.description}</p>
      ) : null}

      {step.detail?.chunk_text ? (
        <p className="workflow-trace__chunk">
          <span className="workflow-trace__chunk-label">Embedding chunk</span>
          <code>{String(step.detail.chunk_text)}</code>
        </p>
      ) : null}

      {neighbors.length > 0 ? (
        <div className="workflow-trace__neighbors">
          <p className="workflow-trace__chunk-label">Similar expenses (top {neighbors.length})</p>
          <ul className="workflow-trace__neighbor-list">
            {neighbors.map((neighbor, neighborIndex) => (
              <li key={`${neighbor.external_transaction_id ?? neighborIndex}`}>
                <code>{neighbor.external_transaction_id ?? "txn"}</code>
                {neighbor.gl_code ? ` · GL ${neighbor.gl_code}` : null}
                {neighbor.similarity !== undefined
                  ? ` · sim ${neighbor.similarity.toFixed(3)}`
                  : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step.phase === "llm" && step.detail && step.status !== "running" ? (
        <div className="workflow-trace__llm-meta">
          {step.detail.llm_skipped ? (
            <span className="badge badge--reason">LLM skipped</span>
          ) : null}
          {typeof step.detail.prompt_tokens === "number" ? (
            <span>
              {step.detail.prompt_tokens} prompt + {String(step.detail.completion_tokens ?? 0)} completion
              tokens
            </span>
          ) : null}
          {typeof step.detail.cost_usd === "number" && !step.detail.llm_skipped ? (
            <span> · ${Number(step.detail.cost_usd).toFixed(4)}</span>
          ) : null}
        </div>
      ) : null}

      {step.phase === "policy" && step.detail?.outcome ? (
        <p className="workflow-trace__meta">
          Outcome: <strong>{String(step.detail.outcome)}</strong>
          {Array.isArray(step.detail.matched_rules) && step.detail.matched_rules.length > 0
            ? ` · ${step.detail.matched_rules.length} rule(s) matched`
            : null}
        </p>
      ) : null}

      {step.phase === "planner" ? (
        <PlannerTraceDetail step={step} />
      ) : null}

      {step.phase === "verifier" && step.detail ? (
        <VerifierTraceDetail detail={step.detail} />
      ) : null}

      {step.phase === "rag" &&
      step.status === "skipped" &&
      step.detail?.skip_reason ? (
        <p className="workflow-trace__meta">
          Skipped: <strong>{String(step.detail.skip_reason)}</strong>
        </p>
      ) : null}

      {step.phase === "decision" && step.detail?.decision ? (
        <p className="workflow-trace__meta">
          <DecisionBadge decision={String(step.detail.decision)} />
          {step.detail.reason ? (
            <span style={{ marginLeft: "0.5rem" }}>— {String(step.detail.reason)}</span>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}
