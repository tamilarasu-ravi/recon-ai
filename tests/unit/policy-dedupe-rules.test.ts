import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickNewestRulePerType } from "@/lib/agents/policy/dedupe-rules";

describe("pickNewestRulePerType", () => {
  it("keeps the newest row per rule type", () => {
    const { kept, duplicateIds } = pickNewestRulePerType([
      {
        id: "old-receipt",
        ruleType: "receipt_required",
        createdAt: "2026-06-07T00:00:00.000Z",
      },
      {
        id: "new-receipt",
        ruleType: "receipt_required",
        createdAt: "2026-06-09T00:00:00.000Z",
      },
      {
        id: "cap",
        ruleType: "single_transaction_cap",
        createdAt: "2026-06-07T00:00:00.000Z",
      },
    ]);

    assert.deepEqual(
      kept.map((rule) => rule.id).sort(),
      ["cap", "new-receipt"],
    );
    assert.deepEqual(duplicateIds, ["old-receipt"]);
  });
});
