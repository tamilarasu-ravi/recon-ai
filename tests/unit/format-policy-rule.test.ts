import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatPolicyRuleConfigSummary,
  formatPolicyRuleTypeLabel,
} from "@/lib/ui/format-policy-rule";

describe("formatPolicyRuleTypeLabel", () => {
  it("maps known rule types to admin labels", () => {
    assert.equal(formatPolicyRuleTypeLabel("receipt_required"), "Receipt required");
    assert.equal(formatPolicyRuleTypeLabel("single_transaction_cap"), "Transaction cap");
    assert.equal(formatPolicyRuleTypeLabel("banned_mcc"), "Banned MCC");
  });
});

describe("formatPolicyRuleConfigSummary", () => {
  it("summarizes receipt and cap rules", () => {
    assert.equal(
      formatPolicyRuleConfigSummary("receipt_required", { min_amount: 75 }),
      "Required for purchases over $75",
    );
    assert.equal(
      formatPolicyRuleConfigSummary("single_transaction_cap", { max_amount: 5000 }),
      "Blocks auto-coding above $5000",
    );
  });

  it("summarizes banned MCC lists", () => {
    assert.equal(
      formatPolicyRuleConfigSummary("banned_mcc", { mccs: ["7995", "7996"] }),
      "Merchant codes: 7995, 7996",
    );
  });
});
