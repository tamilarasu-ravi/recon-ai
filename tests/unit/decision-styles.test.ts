import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDecisionLabel } from "@/lib/ui/decision-styles";

describe("formatDecisionLabel", () => {
  it("maps tri-state decisions to finance-friendly labels", () => {
    assert.equal(formatDecisionLabel("AUTO_TAG"), "Auto-coded");
    assert.equal(formatDecisionLabel("QUEUE_REVIEW"), "Needs review");
    assert.equal(formatDecisionLabel("REFUSE"), "Unclassified");
  });

  it("falls back for unknown decisions", () => {
    assert.equal(formatDecisionLabel("CUSTOM_STATE"), "CUSTOM STATE");
    assert.equal(formatDecisionLabel(null), "");
  });
});
