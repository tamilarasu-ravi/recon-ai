import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeLoadingHideDelayMs,
  LOADING_MIN_VISIBLE_MS,
} from "../../src/lib/ui/loading-timing";

describe("computeLoadingHideDelayMs", () => {
  it("waits remaining min visible time after short requests", () => {
    const visibleSince = 1000;
    const now = 1100;
    const delay = computeLoadingHideDelayMs(visibleSince, now, LOADING_MIN_VISIBLE_MS);
    assert.equal(delay, LOADING_MIN_VISIBLE_MS - 100);
  });

  it("hides immediately when min visible time already elapsed", () => {
    const visibleSince = 1000;
    const now = 1000 + LOADING_MIN_VISIBLE_MS + 50;
    const delay = computeLoadingHideDelayMs(visibleSince, now, LOADING_MIN_VISIBLE_MS);
    assert.equal(delay, 0);
  });

  it("hides immediately when visible timestamp is missing", () => {
    assert.equal(computeLoadingHideDelayMs(null, 5000, LOADING_MIN_VISIBLE_MS), 0);
  });
});
