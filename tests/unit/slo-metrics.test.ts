import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSloSnapshot,
  percentile,
  sumGraphStepLatencyMs,
} from "@/lib/observability/slo-metrics";

describe("slo-metrics", () => {
  it("sums graph step latencies from observability JSON", () => {
    const total = sumGraphStepLatencyMs({
      graph_steps: [
        { node: "evaluatePolicy", latency_ms: 12, status: "ok" },
        { node: "runTagging", latency_ms: 340, status: "ok" },
      ],
    });
    assert.equal(total, 352);
  });

  it("returns null when graph_steps are missing", () => {
    assert.equal(sumGraphStepLatencyMs({}), null);
    assert.equal(sumGraphStepLatencyMs(null), null);
  });

  it("computes percentiles on sorted samples", () => {
    const sorted = [10, 20, 30, 40, 50];
    assert.equal(percentile(sorted, 50), 30);
    assert.equal(percentile(sorted, 95), 48);
  });

  it("marks SLO met when p95 is within target", () => {
    const snapshot = buildSloSnapshot([100, 200, 500, 800], [0.001, 0.002]);
    assert.equal(snapshot.sampleCount, 4);
    assert.ok(
      snapshot.decisionLatencyP95Ms !== null &&
        Math.abs(snapshot.decisionLatencyP95Ms - 755) < 0.01,
    );
    assert.equal(snapshot.sloDecisionLatencyMet, true);
    assert.equal(snapshot.meanCostPerLiveLlmUsd, 0.0015);
  });

  it("marks SLO failed when p95 exceeds target", () => {
    const snapshot = buildSloSnapshot([25_000, 28_000, 31_000, 40_000], []);
    assert.equal(snapshot.sloDecisionLatencyMet, false);
  });
});
