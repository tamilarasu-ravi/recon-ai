import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeRetrievalRecallAt5,
  didRetrievalRecallHit,
  isRetrievalRecallEligible,
  RETRIEVAL_RECALL_AT_5_TARGET,
} from "@/lib/eval/retrieval-recall";

describe("retrieval recall@5", () => {
  it("eligible when expected_gl_code is set", () => {
    assert.equal(isRetrievalRecallEligible({ id: "c1", expected_gl_code: "6100" }), true);
    assert.equal(isRetrievalRecallEligible({ id: "c2" }), false);
    assert.equal(
      isRetrievalRecallEligible({ id: "c3", expected_gl_code: "6100", expect_retrieval_recall: false }),
      false,
    );
  });

  it("detects gold GL in top-5 neighbors", () => {
    const observability = {
      steps: [
        {
          name: "retrieval",
          detail: {
            neighbors: [
              { transaction_id: "t1", gl_account_id: "g1", gl_code: "6200", similarity: 0.9 },
              { transaction_id: "t2", gl_account_id: "g2", gl_code: "6100", similarity: 0.85 },
            ],
          },
        },
      ],
    };

    assert.equal(didRetrievalRecallHit(observability, "6100"), true);
    assert.equal(didRetrievalRecallHit(observability, "6300"), false);
  });

  it("aggregates recall rate", () => {
    const rate = computeRetrievalRecallAt5([
      { id: "a", eligible: true, hit: true, neighbor_gl_codes: ["6100"] },
      { id: "b", eligible: true, hit: false, neighbor_gl_codes: ["6200"] },
      { id: "c", eligible: false, hit: null, neighbor_gl_codes: [] },
    ]);
    assert.equal(rate, 0.5);
    assert.ok(RETRIEVAL_RECALL_AT_5_TARGET >= 0.8);
  });
});
