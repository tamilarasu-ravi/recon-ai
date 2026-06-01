/** Divisor applied to raw INR integers in Kaggle text so policy thresholds stay realistic. */
const KAGGLE_INR_AMOUNT_DIVISOR = 1000;

export interface ParsedKaggleTransaction {
  vendorRaw: string;
  amount: string;
  currency: string;
  txnIdSuffix: string | null;
}

/**
 * Parses Kaggle-style transaction_text into vendor, amount, and currency.
 *
 * @param transactionText - e.g. "Netflix subscription INR 33127 TXN6001238b"
 * @returns Parsed fields, or null when pattern does not match.
 */
export function parseKaggleTransactionText(transactionText: string): ParsedKaggleTransaction | null {
  const match = transactionText.trim().match(/^(.+?)\s+INR\s+(\d+(?:\.\d+)?)(?:\s+(TXN[\w]+))?$/i);
  if (!match) {
    return null;
  }

  const rawInr = Number.parseFloat(match[2]);
  if (Number.isNaN(rawInr)) {
    return null;
  }

  const normalized = (rawInr / KAGGLE_INR_AMOUNT_DIVISOR).toFixed(2);

  return {
    vendorRaw: match[1].trim(),
    amount: normalized,
    currency: "USD",
    txnIdSuffix: match[3] ?? null,
  };
}

/**
 * Normalizes a display amount string for import (already decimal dollars).
 *
 * @param amount - Raw amount from CSV.
 * @returns Two-decimal string.
 */
export function normalizeDecimalAmount(amount: string): string {
  const value = Number.parseFloat(amount);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  return value.toFixed(2);
}
