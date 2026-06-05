import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildApCashForecast,
  buildApRationaleFromForecast,
} from "@/lib/agents/ap/cash-forecast";
import { resolveReceiptChaseChannel } from "@/lib/notifications/receipt-chase";

describe("buildApCashForecast", () => {
  it("aggregates outflow in horizon buckets", () => {
    const asOf = new Date("2026-06-01T00:00:00.000Z");
    const forecast = buildApCashForecast({
      availableCashUsd: 10_000,
      asOf,
      openInvoices: [
        { amount: "100.00", recommendedPayDateIso: "2026-06-03T00:00:00.000Z" },
        { amount: "250.00", recommendedPayDateIso: "2026-06-20T00:00:00.000Z" },
      ],
    });

    assert.equal(forecast.invoiceCount, 2);
    assert.equal(forecast.totalOutflowUsd, 350);
    assert.ok(forecast.buckets[0]!.outflowUsd >= 100);
  });

  it("builds rationale from fixed forecast numbers", () => {
    const forecast = buildApCashForecast({
      availableCashUsd: 50_000,
      openInvoices: [{ amount: "1200.00", recommendedPayDateIso: "2026-06-10T00:00:00.000Z" }],
    });

    const text = buildApRationaleFromForecast(
      "1200.00",
      "USD",
      "2026-06-10T00:00:00.000Z",
      "pay_optimize",
      forecast,
    );

    assert.match(text, /Forecast:/);
    assert.match(text, /50000/);
  });
});

describe("resolveReceiptChaseChannel", () => {
  it("defaults to mock_email", () => {
    const previous = process.env.RECEIPT_CHASE_CHANNEL;
    delete process.env.RECEIPT_CHASE_CHANNEL;
    assert.equal(resolveReceiptChaseChannel(), "mock_email");
    if (previous !== undefined) {
      process.env.RECEIPT_CHASE_CHANNEL = previous;
    }
  });
});
