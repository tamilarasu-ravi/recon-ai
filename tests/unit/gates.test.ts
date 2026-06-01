import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyTriStateGate } from "@/lib/orchestrator/gates";
import { hasUnknownVendorSignal } from "@/lib/orchestrator/safety";

const mockEnv = {
  TAG_AUTO_THRESHOLD: 0.92,
  TAG_REVIEW_THRESHOLD: 0.75,
} as Parameters<typeof applyTriStateGate>[0]["env"];

describe("hasUnknownVendorSignal", () => {
  it("matches explicit unknown vendor names", () => {
    assert.equal(hasUnknownVendorSignal("Unknown Courier 42"), true);
    assert.equal(hasUnknownVendorSignal("Mystery Merchant"), true);
    assert.equal(hasUnknownVendorSignal("AWS"), false);
  });
});

describe("applyTriStateGate", () => {
  it("REFUSEs unknown vendor pattern without rule hit", () => {
    const result = applyTriStateGate({
      confidence: 0.99,
      ruleHit: false,
      supportCount: 5,
      top1Sim: 0.9,
      isNewVendor: true,
      glInCoa: true,
      parseFailed: false,
      promptInjectionDetected: false,
      reviewOnlyGl: false,
      receiptRequiredAndNotCleared: false,
      unknownVendorSignal: true,
      env: mockEnv,
    });
    assert.equal(result.decision, "REFUSE");
    assert.equal(result.reason, "unknown_vendor_pattern");
  });

  it("QUEUE_REVIEWs on prompt injection", () => {
    const result = applyTriStateGate({
      confidence: 0.99,
      ruleHit: true,
      supportCount: 5,
      top1Sim: 0.9,
      isNewVendor: false,
      glInCoa: true,
      parseFailed: false,
      promptInjectionDetected: true,
      reviewOnlyGl: false,
      receiptRequiredAndNotCleared: false,
      unknownVendorSignal: false,
      env: mockEnv,
    });
    assert.equal(result.decision, "QUEUE_REVIEW");
    assert.equal(result.reason, "prompt_injection_guard");
  });
});
