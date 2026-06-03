import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBulkTransactionsCsv } from "@/lib/ingest/bulk-transaction-schema";

describe("parseBulkTransactionsCsv", () => {
  it("parses header and data rows", () => {
    const csv = `external_transaction_id,transaction_timestamp,amount,currency,vendor_raw
ext-1,2026-06-02T10:00:00Z,10.00,USD,STARBUCKS`;

    const rows = parseBulkTransactionsCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.external_transaction_id, "ext-1");
    assert.equal(rows[0]?.vendor_raw, "STARBUCKS");
  });

  it("throws when required header column is missing", () => {
    const csv = `vendor_raw,amount
STARBUCKS,10.00`;

    assert.throws(() => parseBulkTransactionsCsv(csv), /external_transaction_id/);
  });
});
