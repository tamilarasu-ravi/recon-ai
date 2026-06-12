import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AppEnv } from "@/lib/config/env";

import {
  applyVerifierToGate,
  verifyEvidence,
} from "@/lib/agents/tagging/evidence-verifier";

const testEnv = {
  TAG_AUTO_THRESHOLD: 0.92,
  TAG_REVIEW_THRESHOLD: 0.75,
} as AppEnv;

describe("verifyEvidence", () => {
  it("forces review when rule GL differs from LLM suggestion", () => {
    const result = verifyEvidence({
      ruleHit: true,
      ruleGlAccountId: "gl-aws",
      llmSuggestedGl: "gl-other",
      retrievalSkipped: true,
      isNewVendor: false,
      neighborCount: 0,
      supportCount: 0,
      confidence: 0.95,
      env: testEnv,
    });
    assert.equal(result.forceReview, true);
    assert.equal(result.reason, "verifier_rule_llm_mismatch");
  });

  it("forces review when retrieval skipped for new vendor", () => {
    const result = verifyEvidence({
      ruleHit: false,
      ruleGlAccountId: null,
      llmSuggestedGl: "gl-x",
      retrievalSkipped: true,
      isNewVendor: true,
      neighborCount: 0,
      supportCount: 0,
      confidence: 0.8,
      env: testEnv,
    });
    assert.equal(result.forceReview, true);
    assert.equal(result.reason, "verifier_cold_start");
  });

  it("applies confidence penalty for weak neighbor support", () => {
    const result = verifyEvidence({
      ruleHit: false,
      ruleGlAccountId: null,
      llmSuggestedGl: "gl-x",
      retrievalSkipped: false,
      isNewVendor: false,
      neighborCount: 3,
      supportCount: 1,
      confidence: 0.8,
      env: testEnv,
    });
    assert.equal(result.confidenceAdjustment, -0.1);
    assert.equal(result.forceReview, false);
  });

  it("adds concern when no neighbors and no rule", () => {
    const result = verifyEvidence({
      ruleHit: false,
      ruleGlAccountId: null,
      llmSuggestedGl: null,
      retrievalSkipped: false,
      isNewVendor: false,
      neighborCount: 0,
      supportCount: 0,
      confidence: 0.5,
      env: testEnv,
    });
    assert.ok(result.concerns.includes("no_retrieval_neighbors"));
  });
});

describe("applyVerifierToGate", () => {
  it("downgrades AUTO_TAG to QUEUE_REVIEW when verifier forces review", () => {
    const applied = applyVerifierToGate(0.95, "AUTO_TAG", "auto_threshold_met", {
      confidenceAdjustment: 0,
      forceReview: true,
      reason: "verifier_rule_llm_mismatch",
      concerns: ["rule_llm_gl_mismatch"],
    });
    assert.equal(applied.decision, "QUEUE_REVIEW");
    assert.equal(applied.reason, "verifier_rule_llm_mismatch");
  });

  it("preserves REFUSE when verifier only adds concerns", () => {
    const applied = applyVerifierToGate(0.4, "REFUSE", "low_confidence", {
      confidenceAdjustment: 0,
      forceReview: false,
      concerns: ["no_retrieval_neighbors"],
    });
    assert.equal(applied.decision, "REFUSE");
  });
});
