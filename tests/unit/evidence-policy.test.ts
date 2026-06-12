import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveRetrievalPolicy,
  type RetrievalPolicyInput,
} from "@/lib/agents/tagging/evidence-policy";

const COA = new Set(["gl-aws", "gl-slack"]);

function policy(overrides: Partial<RetrievalPolicyInput>): ReturnType<typeof resolveRetrievalPolicy> {
  return resolveRetrievalPolicy({
    ruleHit: false,
    ruleGlAccountId: undefined,
    isNewVendor: false,
    coaAllowList: COA,
    agenticEnabled: true,
    ...overrides,
  });
}

describe("resolveRetrievalPolicy", () => {
  it("always retrieves when agentic flag is off (v1 regression)", () => {
    const result = policy({
      agenticEnabled: false,
      ruleHit: true,
      ruleGlAccountId: "gl-aws",
      isNewVendor: false,
    });
    assert.equal(result.shouldRetrieve, true);
    assert.equal(result.skipReason, "agentic_disabled");
  });

  it("retrieves when no vendor rule hit", () => {
    const result = policy({ ruleHit: false });
    assert.equal(result.shouldRetrieve, true);
    assert.equal(result.skipReason, "no_rule_hit");
  });

  it("retrieves for new vendor even when rule hit", () => {
    const result = policy({
      ruleHit: true,
      ruleGlAccountId: "gl-aws",
      isNewVendor: true,
    });
    assert.equal(result.shouldRetrieve, true);
    assert.equal(result.skipReason, "new_vendor_requires_retrieval");
  });

  it("retrieves when rule GL is not in tenant CoA", () => {
    const result = policy({
      ruleHit: true,
      ruleGlAccountId: "gl-unknown",
      isNewVendor: false,
    });
    assert.equal(result.shouldRetrieve, true);
    assert.equal(result.skipReason, "rule_gl_not_in_coa");
  });

  it("skips retrieval when known vendor rule hits valid CoA GL", () => {
    const result = policy({
      ruleHit: true,
      ruleGlAccountId: "gl-aws",
      isNewVendor: false,
    });
    assert.equal(result.shouldRetrieve, false);
    assert.equal(result.skipReason, "vendor_rule_sufficient");
  });

  it("retrieves when rule hit but GL id missing", () => {
    const result = policy({
      ruleHit: true,
      ruleGlAccountId: undefined,
      isNewVendor: false,
    });
    assert.equal(result.shouldRetrieve, true);
    assert.equal(result.skipReason, "no_rule_hit");
  });
});
