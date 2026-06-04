import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildQuickBooksJournalEntryPayload,
  escapeQuickBooksQueryLiteral,
} from "@/lib/integrations/erp/quickbooks/journal-payload";
import { shouldRefreshQuickBooksAccessToken } from "@/lib/integrations/erp/quickbooks/token-expiry";
import { QUICKBOOKS_TOKEN_REFRESH_BUFFER_MS } from "@/lib/integrations/erp/quickbooks/constants";

describe("shouldRefreshQuickBooksAccessToken", () => {
  it("returns true when expiry is null", () => {
    assert.equal(shouldRefreshQuickBooksAccessToken(null, 1_000_000), true);
  });

  it("returns true inside the refresh buffer window", () => {
    const now = 1_000_000;
    const expiresAt = new Date(now + QUICKBOOKS_TOKEN_REFRESH_BUFFER_MS - 1);
    assert.equal(shouldRefreshQuickBooksAccessToken(expiresAt, now), true);
  });

  it("returns false when expiry is beyond the buffer", () => {
    const now = 1_000_000;
    const expiresAt = new Date(now + QUICKBOOKS_TOKEN_REFRESH_BUFFER_MS + 60_000);
    assert.equal(shouldRefreshQuickBooksAccessToken(expiresAt, now), false);
  });
});

describe("buildQuickBooksJournalEntryPayload", () => {
  it("builds balanced debit and credit lines", () => {
    const payload = buildQuickBooksJournalEntryPayload({
      amount: 42.5,
      debitAccountId: "10",
      creditAccountId: "20",
      memo: "AWS charge",
      transactionDate: "2026-01-15",
    });

    assert.equal(payload.TxnDate, "2026-01-15");
    assert.equal(payload.Line.length, 2);
    assert.equal(payload.Line[0]?.JournalEntryLineDetail.PostingType, "Debit");
    assert.equal(payload.Line[0]?.Amount, 42.5);
    assert.equal(payload.Line[1]?.JournalEntryLineDetail.PostingType, "Credit");
    assert.equal(payload.Line[1]?.JournalEntryLineDetail.AccountRef.value, "20");
  });

  it("rejects non-positive amounts", () => {
    assert.throws(
      () =>
        buildQuickBooksJournalEntryPayload({
          amount: 0,
          debitAccountId: "1",
          creditAccountId: "2",
          memo: "x",
          transactionDate: "2026-01-01",
        }),
      /positive/,
    );
  });
});

describe("escapeQuickBooksQueryLiteral", () => {
  it("escapes single quotes for QBO SQL literals", () => {
    assert.equal(escapeQuickBooksQueryLiteral("6010"), "6010");
    assert.equal(escapeQuickBooksQueryLiteral("O'Brien"), "O''Brien");
  });
});
