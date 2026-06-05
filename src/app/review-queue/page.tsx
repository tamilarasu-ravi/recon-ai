"use client";

import Link from "next/link";
import { useState } from "react";

import { PageLayout } from "@/app/components/page-layout";
import { DecisionBadge } from "@/app/components/ui/decision-badge";
import { ReasonBadge } from "@/app/components/ui/reason-badge";
import { useTenant } from "@/app/components/tenant-provider";
import { useReviewQueue } from "@/lib/ui/use-review-queue";

/**
 * Review queue list with status filter, client cache, and cursor pagination.
 *
 * @returns Review queue page.
 */
export default function ReviewQueuePage(): React.ReactElement {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");

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
      subtitle="Transactions in QUEUE_REVIEW or REFUSE awaiting accountant action."
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
              {value}
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
        <div className="empty-state">No items for this filter.</div>
      ) : null}

      <ul className="queue-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/transactions/${item.transactionId}?tenant_id=${encodeURIComponent(tenantId ?? "")}`}
              className="queue-item queue-item--clickable"
            >
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
                    GL {item.suggestedGlCode}
                  </span>
                ) : null}
              </div>
              <p className="queue-item__meta" style={{ marginBottom: 0 }}>
                <code>{item.externalTransactionId}</code> · confidence {item.confidence ?? "—"}
              </p>
              <span className="queue-item__footer">Why &amp; override →</span>
            </Link>
          </li>
        ))}
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
    </PageLayout>
  );
}
