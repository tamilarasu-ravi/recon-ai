import { isLangfuseEnabled } from "@/lib/observability/langfuse-export";
import {
  SLO_AUTO_TAG_PRECISION_MIN,
  SLO_DECISION_LATENCY_P95_MS,
} from "@/lib/observability/slo-metrics";

export interface ObservabilityRuntimeStatus {
  langfuse_enabled: boolean;
  langfuse_host: string | null;
  slo_decision_latency_p95_ms: number;
  slo_auto_tag_precision_min: number;
}

/**
 * Returns non-secret observability flags for Settings and ops dashboards.
 *
 * @returns Langfuse status and published SLO targets.
 */
export function getObservabilityRuntimeStatus(): ObservabilityRuntimeStatus {
  const host = process.env.LANGFUSE_HOST?.trim() ?? null;

  return {
    langfuse_enabled: isLangfuseEnabled(),
    langfuse_host: host,
    slo_decision_latency_p95_ms: SLO_DECISION_LATENCY_P95_MS,
    slo_auto_tag_precision_min: SLO_AUTO_TAG_PRECISION_MIN,
  };
}
