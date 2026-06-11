"use client";

import { useEffect, useState } from "react";

import { useTenant } from "@/app/components/tenant-provider";
import type { TenantMetricsDto } from "@/lib/data/tenant-metrics";
import { apiFetch } from "@/lib/ui/api-fetch";

/**
 * Dashboard metric tiles for the selected company (finance-friendly labels).
 *
 * @returns Stat grid, loading indicator, or empty-state copy.
 */
export function TenantMetricsPanel(): React.ReactElement {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [metrics, setMetrics] = useState<TenantMetricsDto | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(false);

  useEffect(() => {
    if (!tenantId || tenantLoading) {
      setMetrics(null);
      setMetricsLoading(false);
      setMetricsError(false);
      return;
    }

    let cancelled = false;
    setMetrics(null);
    setMetricsError(false);
    setMetricsLoading(true);

    void (async () => {
      try {
        const response = await apiFetch(
          `/api/metrics?tenant_id=${encodeURIComponent(tenantId)}`,
        );
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setMetricsError(true);
          return;
        }
        const data = (await response.json()) as { metrics: TenantMetricsDto };
        setMetrics(data.metrics);
      } catch {
        if (!cancelled) {
          setMetricsError(true);
        }
      } finally {
        if (!cancelled) {
          setMetricsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, tenantLoading]);

  if (tenantLoading || (tenantId && metricsLoading)) {
    return (
      <div className="metrics-loading" aria-live="polite" aria-busy="true">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            marginBottom: "1.5rem",
          }}
        >
        <span
          className="loading-spinner"
          style={{ width: "1.125rem", height: "1.125rem", borderWidth: "2px" }}
          aria-hidden="true"
        />
        <span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
          Loading company metrics…
        </span>
        </div>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: "1.5rem" }}>
        Metrics appear after you select a company above.
      </p>
    );
  }

  if (!metrics) {
    return (
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: "1.5rem" }}>
        {metricsError
          ? "Could not load metrics for this company. Try refreshing the page."
          : "No metrics available for this company yet."}
      </p>
    );
  }

  const autoCodedPct = `${Math.round(metrics.autoTagRate * 100)}%`;

  return (
    <div className="stat-grid" style={{ marginBottom: "1.75rem" }}>
      <div className="stat">
        <span className="stat__label">Transactions</span>
        <span className="stat__value">{metrics.transactionsTotal}</span>
      </div>
      <div className="stat">
        <span className="stat__label">Auto-coded</span>
        <span className="stat__value">{autoCodedPct}</span>
      </div>
      <div className="stat">
        <span className="stat__label">Needs review</span>
        <span className="stat__value">{metrics.openReviewQueueCount}</span>
      </div>
      <div className="stat">
        <span className="stat__label">Unclassified</span>
        <span className="stat__value">{metrics.refuseCount}</span>
      </div>
      <div className="stat">
        <span className="stat__label">Posted to ERP</span>
        <span className="stat__value">{metrics.erpPostedCount}</span>
      </div>
      <div className="stat">
        <span className="stat__label">AP invoices</span>
        <span className="stat__value">{metrics.invoiceCount}</span>
      </div>
      {metrics.slo.decisionLatencyP95Ms !== null ? (
        <div className="stat">
          <span className="stat__label">Processing time (p95)</span>
          <span className="stat__value">
            {(metrics.slo.decisionLatencyP95Ms / 1000).toFixed(1)}s
            {metrics.slo.sloDecisionLatencyMet ? (
              <span
                className="badge badge--auto"
                style={{ marginLeft: "0.35rem", fontSize: "0.6875rem" }}
              >
                On target
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
