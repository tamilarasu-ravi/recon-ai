import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveFinalGateResult } from "@/lib/agents/tagging/resolve-final-gate";

describe("resolveFinalGateResult", () => {
  it("downgrades to QUEUE_REVIEW when LLM model is unavailable", () => {
    const result = resolveFinalGateResult({
      gateResult: { decision: "AUTO_TAG", reason: "auto_threshold_met" },
      finalConfidence: 0.95,
      parseFailed: true,
      suggestErrorMessage: "Model gemini-1.5-flash is no longer available",
      vendorIsNew: false,
      neighborCount: 3,
      ruleHit: true,
    });

    assert.equal(result.decision, "QUEUE_REVIEW");
    assert.equal(result.reason, "llm_unavailable");
    assert.equal(result.confidence, 0.95);
  });

  it("forces cold-start review for new vendors without neighbors or rules", () => {
    const result = resolveFinalGateResult({
      gateResult: { decision: "AUTO_TAG", reason: "auto_threshold_met" },
      finalConfidence: 0.93,
      parseFailed: false,
      vendorIsNew: true,
      neighborCount: 0,
      ruleHit: false,
    });

    assert.equal(result.decision, "QUEUE_REVIEW");
    assert.equal(result.reason, "new_vendor_cold_start");
  });

  it("preserves REFUSE for cold-start unknown vendors", () => {
    const result = resolveFinalGateResult({
      gateResult: { decision: "REFUSE", reason: "unknown_vendor_signal" },
      finalConfidence: 0.2,
      parseFailed: false,
      vendorIsNew: true,
      neighborCount: 0,
      ruleHit: false,
    });

    assert.equal(result.decision, "REFUSE");
    assert.equal(result.reason, "unknown_vendor_signal");
  });

  it("passes through gate result when no override applies", () => {
    const result = resolveFinalGateResult({
      gateResult: { decision: "QUEUE_REVIEW", reason: "low_confidence_review_band" },
      finalConfidence: 0.8,
      parseFailed: false,
      vendorIsNew: false,
      neighborCount: 2,
      ruleHit: false,
    });

    assert.equal(result.decision, "QUEUE_REVIEW");
    assert.equal(result.reason, "low_confidence_review_band");
  });
});
