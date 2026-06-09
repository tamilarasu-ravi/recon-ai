import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeManualRuleTypeName,
  normalizePolicyRuleTypeName,
  parseManualPolicyRuleInput,
} from "@/lib/ui/parse-policy-rule-form";

describe("normalizePolicyRuleTypeName", () => {
  it("accepts slugs and friendly names for built-in rules", () => {
    assert.equal(normalizePolicyRuleTypeName("receipt_required"), "receipt_required");
    assert.equal(normalizePolicyRuleTypeName("Receipt required"), "receipt_required");
    assert.equal(normalizePolicyRuleTypeName("transaction cap"), "single_transaction_cap");
  });
});

describe("normalizeManualRuleTypeName", () => {
  it("accepts custom rule slugs", () => {
    assert.equal(normalizeManualRuleTypeName("Weekend spending cap"), "weekend_spending_cap");
    assert.equal(normalizeManualRuleTypeName("custom_rule"), "custom_rule");
  });

  it("returns null for invalid slugs", () => {
    assert.equal(normalizeManualRuleTypeName("123_bad"), null);
  });
});

describe("parseManualPolicyRuleInput", () => {
  it("parses valid receipt rule JSON", () => {
    const parsed = parseManualPolicyRuleInput(
      "receipt_required",
      '{"min_amount": 80}',
    );
    assert.equal(parsed.ruleType, "receipt_required");
    assert.deepEqual(parsed.ruleConfig, { min_amount: 80 });
  });

  it("parses custom rules without built-in schema checks", () => {
    const parsed = parseManualPolicyRuleInput(
      "weekend_spending_cap",
      '{"max_amount": 250, "days": ["sat", "sun"]}',
    );
    assert.equal(parsed.ruleType, "weekend_spending_cap");
    assert.deepEqual(parsed.ruleConfig, { max_amount: 250, days: ["sat", "sun"] });
  });

  it("rejects invalid built-in config", () => {
    assert.throws(
      () => parseManualPolicyRuleInput("receipt_required", '{"max_amount": 80}'),
      /Invalid rule configuration|Required|min_amount/,
    );
  });
});
