"use client";

import Link from "next/link";
import { useState } from "react";

import { PageLayout } from "@/app/components/page-layout";
import {
  PipelineTraceModal,
  type PipelineTraceModalTarget,
} from "@/app/components/pipeline-trace-modal";
import { DecisionBadge } from "@/app/components/ui/decision-badge";
import { ReasonBadge } from "@/app/components/ui/reason-badge";
import { useTenant } from "@/app/components/tenant-provider";
import { useReviewQueue } from "@/lib/ui/use-review-queue";

const QUEUE_STATUS_LABELS: Record<"open" | "resolved" | "all", string> = {
  open: "Open",
  resolved: "Resolved",
  all: "All",
};

/**
 * Review queue list with status filter, client cache, and cursor pagination.
 *
 * @returns Review queue page.
 */
export default function ReviewQueuePage(): React.ReactElement {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const [traceModalTarget, setTraceModalTarget] = useState<PipelineTraceModalTarget | null>(
    null,
  );

  const {
    items,
    loading,
    loadingMore,
    revalidating,
    error,
    hasMore,
    fromCache,
    loadMore,
    refresh,
  } = useReviewQueue({
    tenantId,
    status,
    enabled: !tenantLoading && Boolean(tenantId),
  });

  const isQueueBusy =
    loading || loadingMore || (revalidating && items.length === 0);

  return (
    <PageLayout
      title="Review queue"
      subtitle="Expenses that need accountant review or could not be classified automatically."
      loading={isQueueBusy}
      blocking={isQueueBusy}
      blockingLabel={
        loadingMore ? "Loading more…" : revalidating ? "Updating queue…" : "Loading queue…"
      }
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <div className="segmented" role="tablist" aria-label="Queue status filter">
          {(["open", "resolved", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              className={`segmented__btn${status === value ? " segmented__btn--active" : ""}`}
              onClick={() => setStatus(value)}
              disabled={isQueueBusy}
            >
              {QUEUE_STATUS_LABELS[value]}
            </button>
          ))}
        </div>
        <Link href="/review-queue/new" className="btn btn--primary">
          Add transaction
        </Link>
        <button
          type="button"
          className="btn btn--secondary"
          style={{ marginLeft: "auto" }}
          onClick={() => void refresh()}
          disabled={isQueueBusy}
        >
          {revalidating ? "Updating…" : "Refresh"}
        </button>
      </div>

      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", margin: "0 0 1.25rem" }}>
        {loading && items.length === 0
          ? "Loading…"
          : `Showing ${items.length} item${items.length === 1 ? "" : "s"}${hasMore ? " (more available)" : ""}`}
        {fromCache && revalidating ? " · updating in background" : null}
        {fromCache && !revalidating ? " · loaded from cache" : null}
      </p>

      {error ? <p className="alert alert--error">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="empty-state">
          <p style={{ margin: "0 0 0.75rem" }}>
            {status === "open"
              ? "Nothing needs review right now."
              : "No items match this filter."}
          </p>
          {status === "open" ? (
            <p style={{ margin: 0, fontSize: "0.9375rem" }}>
              <Link href="/review-queue/new">Add a sample transaction</Link> to see tagging and
              review in action.
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="queue-list">
        {items.map((item) => {
          const detailHref = `/transactions/${item.transactionId}?tenant_id=${encodeURIComponent(tenantId ?? "")}&run_id=${encodeURIComponent(item.runId)}`;
          return (
            <li key={item.id}>
              <div className="queue-item queue-item--with-trace">
                <Link href={detailHref} className="queue-item--clickable">
                  <div className="queue-item__header">
                    <span className="queue-item__vendor">{item.vendorRaw}</span>
                    <span className="queue-item__amount">
                      {item.amount} {item.currency}
                    </span>
                    <ReasonBadge reason={item.reason} />
                    <DecisionBadge decision={item.taggingDecision} />
                    {item.suggestedGlCode ? (
                      <span
                        className="badge badge--reason"
                        style={{ background: "#f1f5f9", color: "#475569" }}
                      >
                        Suggested {item.suggestedGlCode}
                      </span>
                    ) : null}
                  </div>
                  <p className="queue-item__meta" style={{ marginBottom: 0 }}>
                    Ref {item.externalTransactionId} · confidence {item.confidence ?? "—"}
                  </p>
                  <span className="queue-item__footer">Review &amp; override →</span>
                </Link>
                <div className="queue-item__trace-actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
                    onClick={() =>
                      setTraceModalTarget({
                        transactionId: item.transactionId,
                        runId: item.runId,
                        vendorRaw: item.vendorRaw,
                        externalTransactionId: item.externalTransactionId,
                      })
                    }
                  >
                    View steps
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore ? (
        <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading more…" : "Load more"}
          </button>
        </div>
      ) : null}

      <PipelineTraceModal
        open={traceModalTarget !== null}
        onClose={() => setTraceModalTarget(null)}
        tenantId={tenantId}
        target={traceModalTarget}
      />
    </PageLayout>
  );
}
