import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRetrievalFromObservability } from "@/lib/ui/parse-retrieval";

describe("parseRetrievalFromObservability", () => {
  it("returns null when observability has no steps", () => {
    assert.equal(parseRetrievalFromObservability({}), null);
    assert.equal(parseRetrievalFromObservability(null), null);
  });

  it("parses retrieval neighbors and metrics from audit steps", () => {
    const parsed = parseRetrievalFromObservability({
      steps: [
        {
          name: "retrieval",
          status: "ok",
          latency_ms: 12,
          detail: {
            neighbor_count: 2,
            top1_sim: 0.91,
            support_count: 2,
            agree_frac: 1,
            labeled_corpus_count: 15,
            neighbors: [
              {
                transaction_id: "11111111-1111-1111-1111-111111111111",
                external_transaction_id: "seed-slack-1",
                gl_account_id: "22222222-2222-2222-2222-222222222222",
                gl_code: "6100",
                similarity: 0.91,
              },
            ],
          },
        },
      ],
    });

    assert.ok(parsed);
    assert.equal(parsed.top1Similarity, 0.91);
    assert.equal(parsed.supportCount, 2);
    assert.equal(parsed.neighbors.length, 1);
    assert.equal(parsed.neighbors[0]?.glCode, "6100");
    assert.equal(parsed.neighbors[0]?.externalTransactionId, "seed-slack-1");
    assert.ok(parsed.labeledCorpusHint?.includes("15"));
  });
});
