import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertRateLimit,
  RateLimitExceededError,
  resetRateLimitBucketsForTests,
} from "@/lib/security/rate-limit";

describe("rate limit", () => {
  it("allows requests under the limit", () => {
    resetRateLimitBucketsForTests();
    assert.doesNotThrow(() => assertRateLimit("test-key", 2, 60_000));
    assert.doesNotThrow(() => assertRateLimit("test-key", 2, 60_000));
  });

  it("throws when the limit is exceeded", () => {
    resetRateLimitBucketsForTests();
    assertRateLimit("burst-key", 1, 60_000);
    assert.throws(
      () => assertRateLimit("burst-key", 1, 60_000),
      (error: unknown) => error instanceof RateLimitExceededError,
    );
  });
});
