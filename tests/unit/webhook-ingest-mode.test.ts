import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { isAsyncWebhookIngest } from "@/lib/orchestrator/webhook-ingest-mode";

describe("isAsyncWebhookIngest", () => {
  const original = process.env.WEBHOOK_ASYNC_DEFAULT;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.WEBHOOK_ASYNC_DEFAULT;
    } else {
      process.env.WEBHOOK_ASYNC_DEFAULT = original;
    }
  });

  it("defaults to async when env is unset", () => {
    delete process.env.WEBHOOK_ASYNC_DEFAULT;
    const request = new Request("https://example.com/api/webhooks/transactions?tenant_slug=tenant-a");
    assert.equal(isAsyncWebhookIngest(request), true);
  });

  it("returns false when async=false query param is set", () => {
    const request = new Request(
      "https://example.com/api/webhooks/transactions?tenant_slug=tenant-a&async=false",
    );
    assert.equal(isAsyncWebhookIngest(request), false);
  });
});
