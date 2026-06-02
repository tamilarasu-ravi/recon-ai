import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canBootstrapApiKey } from "@/lib/auth/bootstrap-api-key";

describe("canBootstrapApiKey", () => {
  it("is a function exported for route bootstrap checks", () => {
    assert.equal(typeof canBootstrapApiKey, "function");
  });
});
