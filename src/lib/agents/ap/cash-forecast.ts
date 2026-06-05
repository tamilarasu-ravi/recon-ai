/** Default planning horizon for AP cash forecast buckets (days). */
export const AP_CASH_FORECAST_HORIZON_DAYS = 30;

/** Default mock available cash when AP_AVAILABLE_CASH_USD is unset. */
export const AP_DEFAULT_AVAILABLE_CASH_USD = 50_000;

export interface ApCashForecastInvoice {
  amount: string;
  recommendedPayDateIso: string;
}

export interface ApCashForecastBucket {
  label: string;
  outflowUsd: number;
  invoiceCount: number;
}

export interface ApCashForecast {
  horizonDays: number;
  availableCashUsd: number;
  totalOutflowUsd: number;
  invoiceCount: number;
  buckets: ApCashForecastBucket[];
  runwayDaysAfterPayment: number | null;
}

export interface BuildApCashForecastInput {
  openInvoices: ApCashForecastInvoice[];
  availableCashUsd: number;
  /** Optional invoice being evaluated in the current AP run. */
  pendingInvoice?: ApCashForecastInvoice;
  horizonDays?: number;
  asOf?: Date;
}

/**
 * Parses a decimal amount string safely for forecast math.
 *
 * @param amount - Invoice amount as string.
 * @returns Parsed number or 0 when invalid.
 */
function parseAmount(amount: string): number {
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Computes deterministic AP cash forecast buckets and runway after a pending payment.
 *
 * @param input - Open invoices, available cash, and optional pending invoice.
 * @returns Forecast snapshot with 7/14/30-day outflow buckets.
 */
export function buildApCashForecast(input: BuildApCashForecastInput): ApCashForecast {
  const horizonDays = input.horizonDays ?? AP_CASH_FORECAST_HORIZON_DAYS;
  const asOf = input.asOf ?? new Date();
  const asOfMs = asOf.getTime();
  const horizonEndMs = asOfMs + horizonDays * 24 * 60 * 60 * 1000;

  const invoices = [...input.openInvoices];
  if (input.pendingInvoice) {
    invoices.push(input.pendingInvoice);
  }

  const inHorizon = invoices.filter((invoice) => {
    const payMs = new Date(invoice.recommendedPayDateIso).getTime();
    return payMs >= asOfMs && payMs <= horizonEndMs;
  });

  const totalOutflowUsd = inHorizon.reduce((sum, invoice) => sum + parseAmount(invoice.amount), 0);

  const bucketDefs = [
    { label: "0-7 days", maxDays: 7 },
    { label: "8-14 days", maxDays: 14 },
    { label: "15-30 days", maxDays: 30 },
  ];

  const buckets: ApCashForecastBucket[] = bucketDefs.map((bucket, index) => {
    const minDays = index === 0 ? 0 : bucketDefs[index - 1]!.maxDays;
    const maxDays = bucket.maxDays;
    const minMs = asOfMs + minDays * 24 * 60 * 60 * 1000;
    const maxMs = asOfMs + maxDays * 24 * 60 * 60 * 1000;

    const matching = inHorizon.filter((invoice) => {
      const payMs = new Date(invoice.recommendedPayDateIso).getTime();
      if (index === 0) {
        return payMs >= minMs && payMs <= maxMs;
      }
      return payMs > minMs && payMs <= maxMs;
    });

    return {
      label: bucket.label,
      outflowUsd: matching.reduce((sum, invoice) => sum + parseAmount(invoice.amount), 0),
      invoiceCount: matching.length,
    };
  });

  const pendingAmount = input.pendingInvoice ? parseAmount(input.pendingInvoice.amount) : 0;
  const cashAfterPayment = input.availableCashUsd - pendingAmount;
  const dailyBurn = totalOutflowUsd > 0 ? totalOutflowUsd / horizonDays : 0;
  const runwayDaysAfterPayment =
    dailyBurn > 0 ? Math.max(0, Math.floor(cashAfterPayment / dailyBurn)) : null;

  return {
    horizonDays,
    availableCashUsd: input.availableCashUsd,
    totalOutflowUsd: Number(totalOutflowUsd.toFixed(2)),
    invoiceCount: inHorizon.length,
    buckets,
    runwayDaysAfterPayment,
  };
}

/**
 * Builds a deterministic AP rationale string from fixed forecast numbers (no LLM math).
 *
 * @param amount - Invoice amount string.
 * @param currency - Invoice currency code.
 * @param recommendedPayDateIso - Recommended pay date ISO string.
 * @param fundingSource - Funding source id from recommendApPayment.
 * @param forecast - Precomputed cash forecast snapshot.
 * @returns Narrative for UI and audit.
 */
export function buildApRationaleFromForecast(
  amount: string,
  currency: string,
  recommendedPayDateIso: string,
  fundingSource: string,
  forecast: ApCashForecast,
): string {
  const payDate = new Date(recommendedPayDateIso).toISOString().slice(0, 10);
  const fundingLabel = fundingSource === "pay_optimize" ? "Pay Optimize" : "Card Pay";

  return (
    `${currency} ${amount} due ${payDate} via ${fundingLabel}. ` +
    `Forecast: ${forecast.invoiceCount} invoice(s), ${forecast.totalOutflowUsd.toFixed(2)} USD outflow in ${forecast.horizonDays}d ` +
    `on ${forecast.availableCashUsd.toFixed(2)} USD available cash` +
    (forecast.runwayDaysAfterPayment !== null
      ? ` (~${forecast.runwayDaysAfterPayment}d runway after this payment).`
      : ".")
  );
}
