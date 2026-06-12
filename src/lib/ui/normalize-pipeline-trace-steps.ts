import type { PipelineTraceStepPayload } from "@/lib/pipeline/trace-step";

/** Maps pipeline start events to their matching completion step_ids. */
const START_TO_COMPLETE_STEP_IDS: Record<string, readonly string[]> = {
  "policy-eval-start": ["policy-eval-complete"],
  "orchestrator-start": ["orchestrator-complete", "orchestrator-reprocess-complete"],
};

export const PHASE_HANDOFF_DETAIL_KEY = "phase_handoff";

export const PHASE_HANDOFF_DESCRIPTION =
  "Successfully completed and moved to the next phase.";

/**
 * Returns a user-facing status label for a pipeline trace step.
 *
 * @param step - Normalized trace step payload.
 * @returns Label for the status badge (may differ from raw event status).
 */
export function getPipelineTraceStatusLabel(step: PipelineTraceStepPayload): string {
  if (step.detail?.[PHASE_HANDOFF_DETAIL_KEY] === true) {
    return "completed — next phase";
  }
  return step.status;
}

/**
 * Adjusts stale "running" start events when a later completion event exists for the same phase.
 * Keeps all steps in the timeline; only changes display status and copy.
 *
 * @param steps - Raw append-only trace steps for one run.
 * @param runDone - Whether the orchestrator run has finished.
 * @returns Steps safe to render in the workflow trace UI.
 */
export function normalizePipelineTraceStepsForDisplay(
  steps: PipelineTraceStepPayload[],
  runDone: boolean,
): PipelineTraceStepPayload[] {
  const completeStepIds = new Set(
    steps
      .filter((step) => step.status === "complete" || step.status === "skipped")
      .map((step) => step.step_id),
  );

  return steps.map((step) => {
    if (step.status !== "running") {
      return step;
    }

    const matchingCompleteIds = START_TO_COMPLETE_STEP_IDS[step.step_id];
    const hasMatchingComplete =
      matchingCompleteIds?.some((completeId) => completeStepIds.has(completeId)) ?? false;

    if (hasMatchingComplete || runDone) {
      return withPhaseHandoffDisplay(step);
    }

    return step;
  });
}

/**
 * Marks a running start step as visually complete with handoff messaging.
 *
 * @param step - Original running trace step.
 * @returns Step with complete status and handoff detail for the UI.
 */
function withPhaseHandoffDisplay(step: PipelineTraceStepPayload): PipelineTraceStepPayload {
  const description = step.description
    ? `${step.description} ${PHASE_HANDOFF_DESCRIPTION}`
    : PHASE_HANDOFF_DESCRIPTION;

  return {
    ...step,
    status: "complete",
    description,
    detail: {
      ...step.detail,
      [PHASE_HANDOFF_DETAIL_KEY]: true,
    },
  };
}
