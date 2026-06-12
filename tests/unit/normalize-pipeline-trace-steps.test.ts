import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PipelineTraceStepPayload } from "@/lib/pipeline/trace-step";
import {
  getPipelineTraceStatusLabel,
  normalizePipelineTraceStepsForDisplay,
  PHASE_HANDOFF_DESCRIPTION,
  PHASE_HANDOFF_DETAIL_KEY,
} from "@/lib/ui/normalize-pipeline-trace-steps";

function runningStep(
  stepId: string,
  phase: PipelineTraceStepPayload["phase"],
): PipelineTraceStepPayload {
  return {
    transaction_id: "txn-1",
    step_id: stepId,
    phase,
    title: "Test step",
    status: "running",
  };
}

describe("normalizePipelineTraceStepsForDisplay", () => {
  it("marks policy start as handoff complete when policy complete exists", () => {
    const normalized = normalizePipelineTraceStepsForDisplay(
      [
        runningStep("policy-eval-start", "policy"),
        {
          ...runningStep("policy-eval-complete", "policy"),
          step_id: "policy-eval-complete",
          status: "complete",
        },
      ],
      false,
    );

    assert.equal(normalized[0]?.status, "complete");
    assert.equal(normalized[0]?.detail?.[PHASE_HANDOFF_DETAIL_KEY], true);
    assert.ok(normalized[0]?.description?.includes(PHASE_HANDOFF_DESCRIPTION));
    assert.equal(getPipelineTraceStatusLabel(normalized[0]!), "completed — next phase");
  });

  it("keeps running status while the run is still in flight", () => {
    const normalized = normalizePipelineTraceStepsForDisplay(
      [runningStep("policy-eval-start", "policy")],
      false,
    );

    assert.equal(normalized[0]?.status, "running");
    assert.equal(getPipelineTraceStatusLabel(normalized[0]!), "running");
  });

  it("marks orphan running steps when the run is done", () => {
    const normalized = normalizePipelineTraceStepsForDisplay(
      [runningStep("orchestrator-start", "orchestrator")],
      true,
    );

    assert.equal(normalized[0]?.status, "complete");
    assert.equal(normalized[0]?.detail?.[PHASE_HANDOFF_DETAIL_KEY], true);
  });
});
