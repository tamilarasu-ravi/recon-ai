import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatEventRunLabel,
  groupTransactionEventsByRun,
} from "@/lib/ui/group-transaction-events";

describe("groupTransactionEventsByRun", () => {
  it("groups events by run_id", () => {
    const groups = groupTransactionEventsByRun([
      {
        runId: "run-a",
        eventType: "PolicyEvaluated",
        payload: {},
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        runId: "run-a",
        eventType: "TransactionRetagged",
        payload: {},
        createdAt: "2026-01-02T00:00:01.000Z",
      },
      {
        runId: "run-b",
        eventType: "PolicyEvaluated",
        payload: {},
        createdAt: "2026-01-03T00:00:00.000Z",
      },
    ]);

    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.runId, "run-b");
    assert.equal(groups[0]?.events.length, 1);
    assert.equal(groups[1]?.runId, "run-a");
    assert.equal(groups[1]?.events.length, 2);
  });
});

describe("formatEventRunLabel", () => {
  it("joins event types with arrows", () => {
    const label = formatEventRunLabel(["PolicyEvaluated", "TransactionRetagged"]);
    assert.equal(label, "PolicyEvaluated → TransactionRetagged");
  });
});
