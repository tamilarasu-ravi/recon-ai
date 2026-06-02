import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyPolicyDecisionCap } from "@/lib/orchestrator/policy-cap";

describe("applyPolicyDecisionCap", () => {
  it("downgrades AUTO_TAG to QUEUE_REVIEW when policy is FLAG_REVIEW", () => {
    assert.equal(applyPolicyDecisionCap("AUTO_TAG", "FLAG_REVIEW"), "QUEUE_REVIEW");
  });

  it("keeps AUTO_TAG when policy is ALLOW", () => {
    assert.equal(applyPolicyDecisionCap("AUTO_TAG", "ALLOW"), "AUTO_TAG");
  });

  it("keeps REFUSE regardless of policy outcome", () => {
    assert.equal(applyPolicyDecisionCap("REFUSE", "FLAG_REVIEW"), "REFUSE");
  });
});
