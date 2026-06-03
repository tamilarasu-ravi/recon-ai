import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareEvalSummaries,
  isEvalGatePassing,
} from "@/lib/eval/compare-eval-summary";

const baseline = {
  eval_set_version: "tagging-v1",
  eval_set_hash: "abc",
  case_count: 30,
  pass_rate: 0.9667,
  auto_tag_precision: 1,
  failures: [{ id: "case-14", actual_decision: "AUTO_TAG" }],
};

describe("compareEvalSummaries", () => {
  it("passes when metrics match baseline", () => {
    const issues = compareEvalSummaries(baseline, {
      ...baseline,
      results: [{ id: "case-08", actual_decision: "QUEUE_REVIEW" }],
    });
    assert.equal(isEvalGatePassing(issues), true);
  });

  it("fails on pass_rate regression", () => {
    const issues = compareEvalSummaries(baseline, {
      ...baseline,
      pass_rate: 0.9,
      results: [{ id: "case-08", actual_decision: "REFUSE" }],
    });
    assert.equal(isEvalGatePassing(issues), false);
    assert.ok(issues.some((issue) => issue.code === "pass_rate_regression"));
  });

  it("fails when red-team case AUTO_TAGs", () => {
    const issues = compareEvalSummaries(baseline, {
      ...baseline,
      pass_rate: 0.9667,
      results: [{ id: "case-08", actual_decision: "AUTO_TAG" }],
    });
    assert.equal(isEvalGatePassing(issues), false);
    assert.ok(issues.some((issue) => issue.code === "red_team_auto_tag"));
  });
});
