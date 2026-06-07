/** Target p95 orchestrator decision latency (async ingest → tagged). */
export const SLO_DECISION_LATENCY_P95_MS = 30_000;

/** Minimum AUTO_TAG precision from eval harness (held-out set). */
export const SLO_AUTO_TAG_PRECISION_MIN = 0.95;

export interface GraphStepLike {
  node?: string;
  latency_ms?: number;
  status?: string;
}

export interface SloSnapshot {
  sampleCount: number;
  decisionLatencyP50Ms: number | null;
  decisionLatencyP95Ms: number | null;
  meanCostPerLiveLlmUsd: number | null;
  sloDecisionLatencyMet: boolean | null;
}

/**
 * Sums LangGraph node latencies from a tagging audit observability payload.
 *
 * @param observability - Raw audit_log.observability JSON.
 * @returns Total graph latency in ms, or null when steps are absent.
 */
export function sumGraphStepLatencyMs(observability: unknown): number | null {
  if (!observability || typeof observability !== "object") {
    return null;
  }

  const steps = (observability as { graph_steps?: unknown }).graph_steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return null;
  }

  let total = 0;
  let counted = 0;

  for (const step of steps) {
    if (!step || typeof step !== "object") {
      continue;
    }
    const latency = (step as GraphStepLike).latency_ms;
    if (typeof latency === "number" && Number.isFinite(latency)) {
      total += latency;
      counted += 1;
    }
  }

  return counted > 0 ? total : null;
}

/**
 * Returns the p-th percentile from a sorted numeric array (linear interpolation).
 *
 * @param sorted - Ascending sorted values.
 * @param percentile - Percentile in 0–100.
 * @returns Percentile value or null when empty.
 */
export function percentile(sorted: number[], percentile: number): number | null {
  if (sorted.length === 0) {
    return null;
  }

  const rank = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower] ?? null;
  }

  const weight = rank - lower;
  const lowVal = sorted[lower] ?? 0;
  const highVal = sorted[upper] ?? lowVal;
  return lowVal + weight * (highVal - lowVal);
}

/**
 * Builds SLO snapshot from per-run graph latencies and optional cost samples.
 *
 * @param graphLatenciesMs - Total graph latency per tagging run.
 * @param liveLlmCostsUsd - Cost per run where LLM was not skipped.
 * @returns Percentiles and SLO pass flag.
 */
export function buildSloSnapshot(
  graphLatenciesMs: number[],
  liveLlmCostsUsd: number[],
): SloSnapshot {
  const sorted = [...graphLatenciesMs].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);

  const meanCost =
    liveLlmCostsUsd.length > 0
      ? liveLlmCostsUsd.reduce((sum, value) => sum + value, 0) / liveLlmCostsUsd.length
      : null;

  return {
    sampleCount: graphLatenciesMs.length,
    decisionLatencyP50Ms: p50,
    decisionLatencyP95Ms: p95,
    meanCostPerLiveLlmUsd: meanCost,
    sloDecisionLatencyMet:
      p95 === null ? null : p95 <= SLO_DECISION_LATENCY_P95_MS,
  };
}
