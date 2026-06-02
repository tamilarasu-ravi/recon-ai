import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { RateLimitExceededError } from "@/lib/security/rate-limit";

describe("toRouteErrorResponse", () => {
  it("maps forbidden tenant scope to 403", async () => {
    const response = toRouteErrorResponse(
      new Error("Forbidden: API key is not authorized for this tenant"),
      "fallback",
    );
    assert.equal(response.status, 403);
  });

  it("maps rate limit errors to 429 with Retry-After", async () => {
    const response = toRouteErrorResponse(new RateLimitExceededError(30), "fallback");
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "30");
  });
});
