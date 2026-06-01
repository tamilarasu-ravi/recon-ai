import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveInvoiceDuplicateHash } from "@/lib/agents/ap/duplicate";
import { recommendApPayment } from "@/lib/agents/ap/recommend";

describe("deriveInvoiceDuplicateHash", () => {
  it("is stable for normalized vendor casing", () => {
    const a = deriveInvoiceDuplicateHash({
      tenantId: "t1",
      vendorRaw: "AWS",
      amount: "100.00",
      invoiceDateIso: "2026-05-15T00:00:00.000Z",
    });
    const b = deriveInvoiceDuplicateHash({
      tenantId: "t1",
      vendorRaw: "aws",
      amount: "100.00",
      invoiceDateIso: "2026-05-15T00:00:00.000Z",
    });
    assert.equal(a, b);
  });
});

describe("recommendApPayment", () => {
  it("refuses duplicates without recommending payment", () => {
    const result = recommendApPayment({
      amount: "500.00",
      currency: "USD",
      invoiceDateIso: "2026-05-15T00:00:00.000Z",
      isDuplicate: true,
    });
    assert.equal(result.status, "duplicate_refused");
    assert.equal(result.wouldExecutePayment, false);
  });

  it("recommends pay optimize for large invoices", () => {
    const result = recommendApPayment({
      amount: "2500.00",
      currency: "USD",
      invoiceDateIso: "2026-05-15T00:00:00.000Z",
      isDuplicate: false,
    });
    assert.equal(result.status, "recommend");
    assert.equal(result.fundingSource, "pay_optimize");
  });
});
