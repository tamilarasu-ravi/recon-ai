import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StepSpan } from "@/lib/agents/tagging/run-tagging-agent";
import {
  buildTaggingObservability,
  extractLlmUsageFromSteps,
  parseLlmUsageFromObservability,
} from "@/lib/observability/llm-cost";

describe("extractLlmUsageFromSteps", () => {
  it("reads token and cost fields from llm_tagging step detail", () => {
    const steps: StepSpan[] = [
      {
        name: "llm_tagging",
        status: "ok",
        latency_ms: 100,
        detail: {
          cost_usd: 0.00042,
          prompt_tokens: 400,
          completion_tokens: 80,
          model: "gemini-2.5-flash",
          llm_skipped: false,
        },
      },
    ];

    const usage = extractLlmUsageFromSteps(steps);
    assert.equal(usage.costUsd, 0.00042);
    assert.equal(usage.promptTokens, 400);
    assert.equal(usage.completionTokens, 80);
    assert.equal(usage.totalTokens, 480);
    assert.equal(usage.model, "gemini-2.5-flash");
  });

  it("returns zeros when llm step is missing", () => {
    const usage = extractLlmUsageFromSteps([]);
    assert.equal(usage.costUsd, 0);
    assert.equal(usage.totalTokens, 0);
  });
});

describe("buildTaggingObservability", () => {
  it("hoists cost_usd to observability root for Langfuse and UI", () => {
    const steps: StepSpan[] = [
      {
        name: "llm_tagging",
        status: "ok",
        latency_ms: 50,
        detail: { cost_usd: 0.01, prompt_tokens: 10, completion_tokens: 5, llm_skipped: false },
      },
    ];

    const observability = buildTaggingObservability({ node: "persist" }, steps, {
      llmSkipped: false,
    });

    assert.equal(observability.cost_usd, 0.01);
    assert.equal(observability.prompt_tokens, 10);
    assert.equal(observability.llm_skipped, false);
    assert.ok(Array.isArray(observability.steps));
  });
});

describe("parseLlmUsageFromObservability", () => {
  it("prefers hoisted root fields over nested steps", () => {
    const usage = parseLlmUsageFromObservability({
      cost_usd: 0.05,
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      llm_skipped: false,
    });

    assert.equal(usage.costUsd, 0.05);
    assert.equal(usage.totalTokens, 120);
  });
});
