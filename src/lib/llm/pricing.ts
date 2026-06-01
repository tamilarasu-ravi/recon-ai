/** Approximate USD cost per 1M tokens — dev-scale estimates for audit traces. */
const PRICING_USD_PER_MILLION = {
  google: {
    "gemini-2.0-flash": { input: 0.1, output: 0.4 },
    "gemini-1.5-flash": { input: 0.075, output: 0.3 },
    "gemini-embedding-001": { input: 0.025, output: 0 },
    "text-embedding-004": { input: 0.025, output: 0 },
  },
  openai: {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "text-embedding-3-small": { input: 0.02, output: 0 },
  },
} as const;

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * Estimates USD cost for an LLM call from token counts and model pricing table.
 *
 * @param provider - LLM vendor key.
 * @param model - Model name used for the call.
 * @param usage - Prompt and completion token counts.
 * @returns Estimated cost in USD (0 if model not in table).
 */
export function estimateCostUsd(
  provider: "google" | "openai" | "anthropic",
  model: string,
  usage: TokenUsage,
): number {
  if (provider === "anthropic") {
    return 0;
  }

  const table = PRICING_USD_PER_MILLION[provider] as Record<
    string,
    { input: number; output: number }
  >;
  const rates = table[model];
  if (!rates) {
    return 0;
  }

  const inputCost = (usage.promptTokens / 1_000_000) * rates.input;
  const outputCost = (usage.completionTokens / 1_000_000) * rates.output;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Estimates embedding call cost (input tokens only).
 *
 * @param provider - Embedding provider.
 * @param model - Embedding model name.
 * @param tokenCount - Approximate input tokens.
 * @returns Estimated USD cost.
 */
export function estimateEmbeddingCostUsd(
  provider: "google" | "openai",
  model: string,
  tokenCount: number,
): number {
  return estimateCostUsd(provider, model, {
    promptTokens: tokenCount,
    completionTokens: 0,
  });
}
