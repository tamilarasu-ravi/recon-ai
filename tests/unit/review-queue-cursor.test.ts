import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeReviewQueueCursor,
  encodeReviewQueueCursor,
} from "@/lib/data/review-queue-cursor";

describe("review queue cursor", () => {
  it("round-trips createdAt and id", () => {
    const createdAt = new Date("2026-06-01T12:00:00.000Z");
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const encoded = encodeReviewQueueCursor(createdAt, id);
    const decoded = decodeReviewQueueCursor(encoded);

    assert.ok(decoded);
    assert.equal(decoded?.id, id);
    assert.equal(decoded?.createdAt.toISOString(), createdAt.toISOString());
  });

  it("returns null for invalid cursor", () => {
    assert.equal(decodeReviewQueueCursor("not-valid"), null);
  });
});
