import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { isAsyncIngestRequest } from "@/lib/orchestrator/ingest-mode";

describe("isAsyncIngestRequest", () => {
  const original = process.env.INGEST_ASYNC_DEFAULT;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.INGEST_ASYNC_DEFAULT;
    } else {
      process.env.INGEST_ASYNC_DEFAULT = original;
    }
  });

  it("returns true when async query param is true", () => {
    const request = new Request("https://example.com/api/ingest/transactions?async=true");
    assert.equal(isAsyncIngestRequest(request), true);
  });

  it("returns false when async query param is false even if env default is true", () => {
    process.env.INGEST_ASYNC_DEFAULT = "true";
    const request = new Request("https://example.com/api/ingest/transactions?async=false");
    assert.equal(isAsyncIngestRequest(request), false);
  });

  it("returns true for Prefer respond-async header", () => {
    const request = new Request("https://example.com/api/ingest/transactions", {
      headers: { Prefer: "respond-async" },
    });
    assert.equal(isAsyncIngestRequest(request), true);
  });

  it("returns true when INGEST_ASYNC_DEFAULT is true", () => {
    process.env.INGEST_ASYNC_DEFAULT = "true";
    const request = new Request("https://example.com/api/ingest/transactions");
    assert.equal(isAsyncIngestRequest(request), true);
  });
});
