"use client";

import { useEffect, useState } from "react";

import { useTenant } from "@/app/components/tenant-provider";
import type { TenantMetricsDto } from "@/lib/data/tenant-metrics";
import { apiFetch } from "@/lib/ui/api-fetch";

interface ObservabilityRuntimeStatus {
  langfuse_enabled: boolean;
  langfuse_host: string | null;
  slo_decision_latency_p95_ms: number;
  slo_auto_tag_precision_min: number;
}

interface ObservabilitySloPanelProps {
  /** When true, fetches tenant SLO samples from /api/metrics. */
  showTenantSlo?: boolean;
}

/**
 * Displays Langfuse connection status and tenant decision-latency SLOs.
 *
 * @param props - Whether to load per-tenant SLO samples.
 * @returns Observability panel for Settings or home dashboard.
 */
export function ObservabilitySloPanel({
  showTenantSlo = true,
}: ObservabilitySloPanelProps): React.ReactElement {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [runtime, setRuntime] = useState<ObservabilityRuntimeStatus | null>(null);
  const [metrics, setMetrics] = useState<TenantMetricsDto | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/observability/status");
        if (response.ok) {
          setRuntime((await response.json()) as ObservabilityRuntimeStatus);
        }
      } catch {
        setRuntime(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!showTenantSlo || !tenantId || tenantLoading) {
      setMetrics(null);
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
  }, [showTenantSlo, tenantId, tenantLoading]);

  const slo = metrics?.slo;
  const p95TargetMs = runtime?.slo_decision_latency_p95_ms ?? 30_000;

  return (
    <section className="panel panel--muted">
      <h2 className="panel__title">Quality &amp; performance</h2>
      <p className="panel__desc">
        Processing speed and auto-coding accuracy targets for this company. Optional trace export
        can mirror run history for deeper analysis.
      </p>

      <div className="stat-grid" style={{ marginBottom: "1rem" }}>
        <div className="stat">
          <span className="stat__label">Trace export</span>
          <span className="stat__value">
            {runtime?.langfuse_enabled ? (
              <span className="badge badge--auto">Active</span>
            ) : (
              <span className="badge badge--reason">Off</span>
            )}
          </span>
        </div>
        {runtime?.langfuse_host ? (
          <div className="stat">
            <span className="stat__label">Export host</span>
            <span className="stat__value" style={{ fontSize: "0.8125rem" }}>
              {runtime.langfuse_host}
            </span>
          </div>
        ) : null}
        <div className="stat">
          <span className="stat__label">Target p95 latency</span>
          <span className="stat__value">≤ {(p95TargetMs / 1000).toFixed(0)}s</span>
        </div>
        <div className="stat">
          <span className="stat__label">Target auto-code accuracy</span>
          <span className="stat__value">
            ≥ {Math.round((runtime?.slo_auto_tag_precision_min ?? 0.95) * 100)}%
          </span>
        </div>
      </div>

      {showTenantSlo && slo ? (
        <div className="stat-grid" style={{ marginBottom: "1rem" }}>
          <div className="stat">
            <span className="stat__label">Median processing time</span>
            <span className="stat__value">
              {slo.decisionLatencyP50Ms !== null
                ? `${Math.round(slo.decisionLatencyP50Ms)}ms`
                : "—"}
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">95th percentile time</span>
            <span className="stat__value">
              {slo.decisionLatencyP95Ms !== null
                ? `${Math.round(slo.decisionLatencyP95Ms)}ms`
                : "—"}
              {slo.sloDecisionLatencyMet === true ? (
                <span className="badge badge--auto" style={{ marginLeft: "0.5rem" }}>
                  SLO OK
                </span>
              ) : null}
              {slo.sloDecisionLatencyMet === false ? (
                <span className="badge badge--refuse" style={{ marginLeft: "0.5rem" }}>
                  Over SLO
                </span>
              ) : null}
            </span>
          </div>
          <div className="stat">
            <span className="stat__label">Recent runs sampled</span>
            <span className="stat__value">{slo.sampleCount}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Mean LLM cost / live run</span>
            <span className="stat__value">
              {slo.meanCostPerLiveLlmUsd !== null
                ? `$${slo.meanCostPerLiveLlmUsd.toFixed(4)}`
                : "—"}
            </span>
          </div>
        </div>
      ) : null}

      {showTenantSlo && !tenantId ? (
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
          Select a company to see measured processing times from recent expenses.
        </p>
      ) : null}
    </section>
  );
}
