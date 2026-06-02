import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { syncReviewQueueAfterTagging } from "@/lib/orchestrator/review-queue-sync";

describe("syncReviewQueueAfterTagging", () => {
  it("resolves open items and skips insert on AUTO_TAG", async () => {
    const updates: unknown[] = [];
    const inserts: unknown[] = [];
    const db = {
      update: () => ({
        set: (values: unknown) => ({
          where: async () => {
            updates.push(values);
          },
        }),
      }),
      insert: () => ({
        values: async (values: unknown) => {
          inserts.push(values);
        },
      }),
    };

    await syncReviewQueueAfterTagging(
      db as never,
      "tenant-1",
      "txn-1",
      "AUTO_TAG",
      "auto_threshold_met",
      "run-1",
    );

    assert.deepEqual(updates, [{ status: "resolved" }]);
    assert.deepEqual(inserts, []);
  });

  it("opens a new review item when decision remains QUEUE_REVIEW", async () => {
    const inserts: unknown[] = [];
    const db = {
      update: () => ({
        set: () => ({
          where: async () => undefined,
        }),
      }),
      insert: () => ({
        values: async (values: unknown) => {
          inserts.push(values);
        },
      }),
    };

    await syncReviewQueueAfterTagging(
      db as never,
      "tenant-1",
      "txn-1",
      "QUEUE_REVIEW",
      "low_confidence_review_band",
      "run-2",
    );

    assert.deepEqual(inserts, [
      {
        tenantId: "tenant-1",
        transactionId: "txn-1",
        reason: "low_confidence_review_band",
        status: "open",
        runId: "run-2",
      },
    ]);
  });
});
