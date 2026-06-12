import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyEvidencePlanOverrides,
  buildFallbackEvidencePlan,
  buildHeuristicEvidencePlan,
  shouldRetrieveFromPlan,
  type EvidencePlannerInput,
} from "@/lib/agents/tagging/evidence-planner";

const COA = new Set(["gl-aws", "gl-slack"]);

function plannerInput(overrides: Partial<EvidencePlannerInput> = {}): EvidencePlannerInput {
  return {
    vendorRaw: "Amazon Web Services",
    amount: "120.00",
    currency: "USD",
    vendorId: "vendor-1",
    isNewVendor: false,
    ruleHit: false,
    labeledCorpusCount: 10,
    policyOutcome: "ALLOW",
    receiptBlocked: false,
    coaAllowList: COA,
    ...overrides,
  };
}

describe("applyEvidencePlanOverrides", () => {
  it("forces similar_transactions for new vendors", () => {
    const plan = applyEvidencePlanOverrides(
      { tools: ["vendor_rules"], rationale: "rule only", source: "llm" },
      plannerInput({ isNewVendor: true }),
    );
    assert.equal(plan.tools.includes("similar_transactions"), true);
  });

  it("allows omitting similar_transactions when rule hits valid CoA GL", () => {
    const plan = applyEvidencePlanOverrides(
      {
        tools: ["vendor_rules", "similar_transactions"],
        rationale: "retrieve anyway",
        source: "llm",
      },
      plannerInput({
        ruleHit: true,
        ruleGlAccountId: "gl-aws",
        isNewVendor: false,
      }),
    );
    assert.equal(plan.tools.includes("similar_transactions"), false);
    assert.equal(plan.tools.includes("vendor_rules"), true);
  });

  it("includes policy_context when receipt is blocked", () => {
    const plan = applyEvidencePlanOverrides(
      { tools: ["vendor_rules"], rationale: "minimal", source: "llm" },
      plannerInput({ receiptBlocked: true, policyOutcome: "FLAG_RECEIPT" }),
    );
    assert.equal(plan.tools.includes("policy_context"), true);
  });

  it("fallback plan includes vendor_rules and similar_transactions", () => {
    const fallback = applyEvidencePlanOverrides(buildFallbackEvidencePlan(), plannerInput());
    assert.equal(fallback.tools.includes("vendor_rules"), true);
    assert.equal(fallback.tools.includes("similar_transactions"), true);
    assert.equal(fallback.source, "fallback");
  });
});

describe("buildHeuristicEvidencePlan", () => {
  it("skips retrieval in heuristic plan for sufficient vendor rule", () => {
    const plan = buildHeuristicEvidencePlan(
      plannerInput({
        ruleHit: true,
        ruleGlAccountId: "gl-aws",
        isNewVendor: false,
      }),
    );
    assert.equal(plan.tools.includes("similar_transactions"), false);
    assert.equal(shouldRetrieveFromPlan(plan), false);
  });

  it("includes retrieval for new vendor in heuristic plan", () => {
    const plan = buildHeuristicEvidencePlan(
      plannerInput({ isNewVendor: true, ruleHit: true, ruleGlAccountId: "gl-aws" }),
    );
    assert.equal(plan.tools.includes("similar_transactions"), true);
    assert.equal(shouldRetrieveFromPlan(plan), true);
  });
});
