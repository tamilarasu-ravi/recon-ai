import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeTransactionRuns } from "@/lib/ui/merge-transaction-runs";

describe("mergeTransactionRuns", () => {
  it("merges audit rows with event groups by run_id", () => {
    const merged = mergeTransactionRuns(
      [
        {
          runId: "run-a",
          createdAt: "2026-06-01T10:00:00Z",
          events: [
            {
              eventType: "TransactionTagged",
              runId: "run-a",
              payload: { decision: "AUTO_TAG" },
              createdAt: "2026-06-01T10:00:01Z",
            },
          ],
        },
      ],
      [
        {
          runId: "run-a",
          decision: "AUTO_TAG",
          confidence: "0.95",
          createdAt: "2026-06-01T10:00:02Z",
        },
      ],
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.runId, "run-a");
    assert.equal(merged[0]?.events.length, 1);
    assert.equal(merged[0]?.audit?.decision, "AUTO_TAG");
    assert.equal(merged[0]?.createdAt, "2026-06-01T10:00:02Z");
  });

  it("includes audit-only runs with no domain events", () => {
    const merged = mergeTransactionRuns(
      [],
      [
        {
          runId: "run-b",
          decision: "QUEUE_REVIEW",
          confidence: "0.80",
          createdAt: "2026-06-02T12:00:00Z",
        },
      ],
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.events.length, 0);
    assert.equal(merged[0]?.audit?.decision, "QUEUE_REVIEW");
  });
});
