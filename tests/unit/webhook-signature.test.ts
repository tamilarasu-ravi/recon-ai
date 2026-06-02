import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildWebhookSignatureHeader,
  computeWebhookSignatureV1,
  parseWebhookSignatureHeader,
  verifyWebhookSignature,
} from "@/lib/integrations/webhooks/verify-signature";

describe("webhook signature", () => {
  it("round-trips sign and verify", () => {
    const secret = "whsec_test_secret_value";
    const rawBody = JSON.stringify({ vendor_raw: "Slack", amount: "10.00" });
    const { header, timestamp } = buildWebhookSignatureHeader(secret, rawBody);

    const parsed = parseWebhookSignatureHeader(header);
    assert.ok(parsed);
    assert.equal(parsed.timestamp, timestamp);

    const expected = computeWebhookSignatureV1(secret, timestamp, rawBody);
    assert.equal(parsed.signatureV1, expected);
    assert.equal(verifyWebhookSignature(secret, rawBody, header, 300), true);
  });

  it("rejects tampered body", () => {
    const secret = "whsec_test";
    const rawBody = '{"amount":"10.00"}';
    const { header } = buildWebhookSignatureHeader(secret, rawBody);

    assert.equal(verifyWebhookSignature(secret, '{"amount":"99.00"}', header, 300), false);
  });

  it("rejects expired timestamp", () => {
    const secret = "whsec_test";
    const rawBody = "{}";
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const signature = computeWebhookSignatureV1(secret, String(oldTimestamp), rawBody);
    const header = `t=${oldTimestamp},v1=${signature}`;

    assert.equal(verifyWebhookSignature(secret, rawBody, header, 300), false);
  });
});
