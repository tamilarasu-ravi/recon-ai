import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseKaggleTransactionText } from "@/lib/data/parse-transaction-text";

describe("parseKaggleTransactionText", () => {
  it("parses vendor, INR amount, and txn suffix", () => {
    const parsed = parseKaggleTransactionText("Netflix subscription INR 33127 TXN6001238b");
    assert.ok(parsed);
    assert.equal(parsed.vendorRaw, "Netflix subscription");
    assert.equal(parsed.amount, "33.13");
    assert.equal(parsed.txnIdSuffix, "TXN6001238b");
  });

  it("returns null for invalid lines", () => {
    assert.equal(parseKaggleTransactionText("no inr here"), null);
  });
});
