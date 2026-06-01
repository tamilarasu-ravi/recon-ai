import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("isLangfuseEnabled", () => {
  it("returns false when Langfuse keys are unset", async () => {
    const previousPublic = process.env.LANGFUSE_PUBLIC_KEY;
    const previousSecret = process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;

    const { isLangfuseEnabled } = await import("@/lib/observability/langfuse-export");
    assert.equal(isLangfuseEnabled(), false);

    if (previousPublic !== undefined) process.env.LANGFUSE_PUBLIC_KEY = previousPublic;
    if (previousSecret !== undefined) process.env.LANGFUSE_SECRET_KEY = previousSecret;
  });
});
