"use client";

import { useEffect, useState } from "react";

import { useTenant } from "@/app/components/tenant-provider";
import type { TenantMetricsDto } from "@/lib/data/tenant-metrics";
import { apiFetch } from "@/lib/ui/api-fetch";

/**
 * Dashboard metric tiles for the selected tenant.
 *
 * @returns Stat grid or loading placeholder.
 */
export function TenantMetricsPanel(): React.ReactElement {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [metrics, setMetrics] = useState<TenantMetricsDto | null>(null);

  useEffect(() => {
    if (!tenantId || tenantLoading) {
      return;
    }

    void (async () => {
      try {
        const response = await apiFetch(
          `/api/metrics?tenant_id=${encodeURIComponent(tenantId)}`,
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { metrics: TenantMetricsDto };
        setMetrics(data.metrics);
      } catch {
        setMetrics(null);
      }
    })();
  }, [tenantId, tenantLoading]);

  if (!metrics) {
    return (
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: "1.5rem" }}>
        Metrics load after tenant selection.
      </p>
    );
  }

  const autoTagPct = `${Math.round(metrics.autoTagRate * 100)}%`;
  const costLabel =
    metrics.llmCostUsdTotal < 0.01
      ? `$${metrics.llmCostUsdTotal.toFixed(4)}`
      : `$${metrics.llmCostUsdTotal.toFixed(2)}`;

  return (
    <div className="stat-grid" style={{ marginBottom: "1.75rem" }}>
      <div className="stat">
        <span className="stat__label">Transactions</span>
        <span className="stat__value">{metrics.transactionsTotal}</span>
      </div>
      <div className="stat">
        <span className="stat__label">AUTO_TAG rate</span>
        <span className="stat__value">{autoTagPct}</span>
      </div>
      <div className="stat">
        <span className="stat__label">Open review</span>
        <span className="stat__value">{metrics.openReviewQueueCount}</span>
      </div>
      <div className="stat">
        <span className="stat__label">ERP posted</span>
        <span className="stat__value">{metrics.erpPostedCount}</span>
      </div>
      <div className="stat">
        <span className="stat__label">AP invoices</span>
        <span className="stat__value">{metrics.invoiceCount}</span>
      </div>
      <div className="stat">
        <span className="stat__label">REFUSE</span>
        <span className="stat__value">{metrics.refuseCount}</span>
      </div>
      <div className="stat">
        <span className="stat__label">LLM cost (audit)</span>
        <span className="stat__value">{costLabel}</span>
      </div>
      <div className="stat">
        <span className="stat__label">LLM tokens</span>
        <span className="stat__value">
          {metrics.llmPromptTokensTotal + metrics.llmCompletionTokensTotal}
        </span>
      </div>
      <div className="stat">
        <span className="stat__label">Live LLM runs</span>
        <span className="stat__value">{metrics.llmRunsWithLiveCall}</span>
      </div>
      {metrics.slo.decisionLatencyP95Ms !== null ? (
        <div className="stat">
          <span className="stat__label">p95 graph latency</span>
          <span className="stat__value">
            {Math.round(metrics.slo.decisionLatencyP95Ms)}ms
            {metrics.slo.sloDecisionLatencyMet ? (
              <span className="badge badge--auto" style={{ marginLeft: "0.35rem", fontSize: "0.6875rem" }}>
                SLO
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
