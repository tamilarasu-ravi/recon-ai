import type { StepSpan } from "@/lib/agents/tagging/run-tagging-agent";

export interface LlmUsageSummary {
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model?: string;
  promptVersion?: string;
  llmSkipped: boolean;
  llmSkippedReason?: string;
}

/**
 * Reads numeric fields from an llm_tagging step detail object.
 *
 * @param detail - Step detail record from tagging agent spans.
 * @returns Token and cost fields when present.
 */
function readLlmStepDetail(detail: Record<string, unknown> | undefined): LlmUsageSummary {
  const promptTokens = typeof detail?.prompt_tokens === "number" ? detail.prompt_tokens : 0;
  const completionTokens =
    typeof detail?.completion_tokens === "number" ? detail.completion_tokens : 0;
  const costUsd = typeof detail?.cost_usd === "number" ? detail.cost_usd : 0;

  return {
    costUsd,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    model: typeof detail?.model === "string" ? detail.model : undefined,
    promptVersion: typeof detail?.prompt_version === "string" ? detail.prompt_version : undefined,
    llmSkipped: detail?.llm_skipped === true,
    llmSkippedReason:
      typeof detail?.llm_skipped_reason === "string" ? detail.llm_skipped_reason : undefined,
  };
}

/**
 * Extracts LLM usage and cost from tagging agent step spans.
 *
 * @param steps - Agent pipeline step trace.
 * @returns Aggregated usage for the llm_tagging step (zeros when skipped).
 */
export function extractLlmUsageFromSteps(steps: StepSpan[]): LlmUsageSummary {
  const llmStep = steps.find((step) => step.name === "llm_tagging");
  const detail =
    llmStep?.detail && typeof llmStep.detail === "object"
      ? (llmStep.detail as Record<string, unknown>)
      : undefined;

  return readLlmStepDetail(detail);
}

/**
 * Builds audit_log observability with hoisted cost fields for Langfuse and UI.
 *
 * @param base - Node-specific observability fields.
 * @param steps - Tagging agent step spans.
 * @param extras - Additional flags (policy outcome, graph steps, etc.).
 * @returns Observability payload with root-level cost_usd and token fields.
 */
export function buildTaggingObservability(
  base: Record<string, unknown>,
  steps: StepSpan[],
  extras: {
    llmSkipped: boolean;
    llmSkippedReason?: string;
  },
): Record<string, unknown> {
  const usage = extractLlmUsageFromSteps(steps);

  return {
    ...base,
    steps,
    llm_skipped: extras.llmSkipped,
    llm_skipped_reason: extras.llmSkippedReason,
    cost_usd: usage.costUsd,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
    model: usage.model,
    prompt_version: usage.promptVersion,
  };
}

/**
 * Parses hoisted LLM cost fields from a stored observability JSON object.
 *
 * @param observability - Raw audit_log.observability column.
 * @returns Usage summary (zeros when fields are absent).
 */
export function parseLlmUsageFromObservability(
  observability: Record<string, unknown>,
): LlmUsageSummary {
  const rootCost = typeof observability.cost_usd === "number" ? observability.cost_usd : undefined;
  if (rootCost !== undefined) {
    const promptTokens =
      typeof observability.prompt_tokens === "number" ? observability.prompt_tokens : 0;
    const completionTokens =
      typeof observability.completion_tokens === "number" ? observability.completion_tokens : 0;

    return {
      costUsd: rootCost,
      promptTokens,
      completionTokens,
      totalTokens:
        typeof observability.total_tokens === "number"
          ? observability.total_tokens
          : promptTokens + completionTokens,
      model: typeof observability.model === "string" ? observability.model : undefined,
      promptVersion:
        typeof observability.prompt_version === "string" ? observability.prompt_version : undefined,
      llmSkipped: observability.llm_skipped === true,
      llmSkippedReason:
        typeof observability.llm_skipped_reason === "string"
          ? observability.llm_skipped_reason
          : undefined,
    };
  }

  const steps = Array.isArray(observability.steps) ? (observability.steps as StepSpan[]) : [];
  return extractLlmUsageFromSteps(steps);
}
