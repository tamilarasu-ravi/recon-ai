import type { AppEnv } from "@/lib/config/env";
import { createLlmClient, LlmUnavailableError } from "@/lib/llm/client";
import { buildTaggingSystemPrompt, buildTaggingUserPrompt, TAGGING_PROMPT_VERSION } from "@/lib/llm/prompts/tagging";
import { taggingSuggestionSchema, type TaggingSuggestion } from "@/lib/llm/schemas";
import type { RetrievalNeighbor } from "@/lib/agents/tagging/retrieval";

export interface CoaEntry {
  id: string;
  glCode: string;
  glName: string;
}

export interface SuggestTaggingInput {
  vendorRaw: string;
  memo?: string;
  amount: string;
  currency: string;
  mcc?: string;
  coaEntries: CoaEntry[];
  neighbors: RetrievalNeighbor[];
  ruleGlAccountId?: string;
  globalPriorHint?: string;
  policyContextSummary?: string;
  invoiceMatchSummary?: string;
}

export interface SuggestTaggingResult {
  parseStatus: "ok" | "failed";
  suggestion?: TaggingSuggestion;
  llmSkipped: boolean;
  llmSkippedReason?: string;
  llmMeta?: {
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    latencyMs: number;
    model: string;
  };
  errorMessage?: string;
}

/**
 * Produces a structured GL tagging suggestion via one LLM call (or skip when rule-only).
 *
 * @param env - Application environment.
 * @param input - Transaction and retrieval context.
 * @param options - Optional skip when vendor rule already determines GL.
 * @returns Parsed suggestion or parse failure metadata.
 */
export async function suggestTagging(
  env: AppEnv,
  input: SuggestTaggingInput,
  options?: { skipLlm?: boolean; skipReason?: string },
): Promise<SuggestTaggingResult> {
  if (options?.skipLlm && input.ruleGlAccountId) {
    return {
      parseStatus: "ok",
      suggestion: {
        gl_account_id: input.ruleGlAccountId,
        rationale: "Deterministic vendor rule match — LLM skipped.",
      },
      llmSkipped: true,
      llmSkippedReason: options.skipReason ?? "vendor_rule_hit",
    };
  }

  if (!env.LLM_ENABLE_LIVE_CALLS) {
    if (input.ruleGlAccountId) {
      return {
        parseStatus: "ok",
        suggestion: {
          gl_account_id: input.ruleGlAccountId,
          rationale: "Fixture mode — vendor rule.",
        },
        llmSkipped: true,
        llmSkippedReason: "fixture_rule",
      };
    }
    if (input.neighbors[0]) {
      return {
        parseStatus: "ok",
        suggestion: {
          gl_account_id: input.neighbors[0].glAccountId,
          rationale: "Fixture mode — top retrieval neighbor.",
        },
        llmSkipped: true,
        llmSkippedReason: "fixture_retrieval",
      };
    }
    return {
      parseStatus: "failed",
      llmSkipped: true,
      llmSkippedReason: "fixture_no_signal",
      errorMessage: "fixture_no_signal",
    };
  }

  const llm = createLlmClient(env);

  try {
    const result = await llm.generateStructuredJson<TaggingSuggestion>({
      systemPrompt: buildTaggingSystemPrompt(),
      userPrompt: buildTaggingUserPrompt({
        vendorRaw: input.vendorRaw,
        memo: input.memo,
        amount: input.amount,
        currency: input.currency,
        mcc: input.mcc,
        coaEntries: input.coaEntries,
        neighbors: input.neighbors,
        ruleGlAccountId: input.ruleGlAccountId,
        globalPriorHint: input.globalPriorHint,
        policyContextSummary: input.policyContextSummary,
        invoiceMatchSummary: input.invoiceMatchSummary,
      }),
      schema: taggingSuggestionSchema,
      promptVersion: TAGGING_PROMPT_VERSION,
    });

    return {
      parseStatus: "ok",
      suggestion: result.data,
      llmSkipped: false,
      llmMeta: {
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        model: result.model,
      },
    };
  } catch (error) {
    const message =
      error instanceof LlmUnavailableError
        ? error.message
        : error instanceof Error
          ? error.message
          : "llm_failed";

    return {
      parseStatus: "failed",
      llmSkipped: false,
      errorMessage: message,
    };
  }
}
