import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  computeProcessingRetryDelayMs,
  DEFAULT_MAX_PROCESSING_ATTEMPTS,
  getMaxProcessingAttempts,
  isTerminalProcessingStatus,
} from "@/lib/orchestrator/processing-retry";

describe("processing-retry", () => {
  const originalMax = process.env.PROCESSING_MAX_ATTEMPTS;

  afterEach(() => {
    if (originalMax === undefined) {
      delete process.env.PROCESSING_MAX_ATTEMPTS;
    } else {
      process.env.PROCESSING_MAX_ATTEMPTS = originalMax;
    }
  });

  it("marks completed, failed, and dead_letter as terminal", () => {
    assert.equal(isTerminalProcessingStatus("completed"), true);
    assert.equal(isTerminalProcessingStatus("failed"), true);
    assert.equal(isTerminalProcessingStatus("dead_letter"), true);
    assert.equal(isTerminalProcessingStatus("pending"), false);
    assert.equal(isTerminalProcessingStatus("processing"), false);
  });

  it("applies exponential backoff per attempt", () => {
    assert.equal(computeProcessingRetryDelayMs(1), 30_000);
    assert.equal(computeProcessingRetryDelayMs(2), 120_000);
    assert.equal(computeProcessingRetryDelayMs(3), 480_000);
  });

  it("falls back to default max attempts when env is invalid", () => {
    process.env.PROCESSING_MAX_ATTEMPTS = "not-a-number";
    assert.equal(getMaxProcessingAttempts(), DEFAULT_MAX_PROCESSING_ATTEMPTS);
  });
});
