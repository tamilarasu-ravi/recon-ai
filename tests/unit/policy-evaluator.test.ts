import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluatePolicyRule,
  evaluatePolicyRules,
} from "@/lib/agents/policy/evaluator";
import type { PolicyRuleRow } from "@/lib/agents/policy/types";

describe("evaluatePolicyRule", () => {
  it("flags receipt when amount meets threshold", () => {
    const rule: PolicyRuleRow = {
      ruleType: "receipt_required",
      ruleConfig: { min_amount: 75 },
    };
    const match = evaluatePolicyRule(rule, { amount: "99.00", currency: "USD" });
    assert.equal(match?.outcome, "FLAG_RECEIPT");
  });

  it("allows small amounts under receipt threshold", () => {
    const rule: PolicyRuleRow = {
      ruleType: "receipt_required",
      ruleConfig: { min_amount: 75 },
    };
    const match = evaluatePolicyRule(rule, { amount: "14.50", currency: "USD" });
    assert.equal(match, null);
  });

  it("flags banned mcc codes", () => {
    const rule: PolicyRuleRow = {
      ruleType: "banned_mcc",
      ruleConfig: { mccs: ["5813"] },
    };
    const match = evaluatePolicyRule(rule, {
      amount: "20.00",
      currency: "USD",
      mcc: "5813",
    });
    assert.equal(match?.outcome, "FLAG_REVIEW");
  });

  it("flags amounts over single-transaction cap", () => {
    const rule: PolicyRuleRow = {
      ruleType: "single_transaction_cap",
      ruleConfig: { max_amount: 5000 },
    };
    const match = evaluatePolicyRule(rule, { amount: "5001.00", currency: "USD" });
    assert.equal(match?.outcome, "FLAG_REVIEW");
  });
});

describe("evaluatePolicyRules", () => {
  it("merges to strictest outcome when multiple rules match", () => {
    const rules: PolicyRuleRow[] = [
      { ruleType: "receipt_required", ruleConfig: { min_amount: 75 } },
      { ruleType: "single_transaction_cap", ruleConfig: { max_amount: 5000 } },
    ];
    const result = evaluatePolicyRules("v1.0.0", "policy-id", rules, {
      amount: "5001.00",
      currency: "USD",
    });
    assert.equal(result.outcome, "FLAG_REVIEW");
    assert.equal(result.matchedRules.length, 2);
  });
});
