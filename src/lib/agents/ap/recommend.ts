const FUNDING_CARD_PAY = "card_pay";
const FUNDING_PAY_OPTIMIZE = "pay_optimize";

export type ApRecommendationStatus = "recommend" | "duplicate_refused";

export interface ApRecommendInput {
  amount: string;
  currency: string;
  invoiceDateIso: string;
  isDuplicate: boolean;
}

export interface ApRecommendation {
  status: ApRecommendationStatus;
  recommendedPayDateIso: string;
  fundingSource: string;
  rationale: string;
  wouldExecutePayment: false;
}

/**
 * Builds a deterministic pay-date recommendation from invoice amount and date.
 *
 * @param invoiceDate - Parsed invoice date.
 * @param amount - Invoice amount as decimal string.
 * @returns Recommended pay date in UTC.
 */
function computeRecommendedPayDate(invoiceDate: Date, amount: number): Date {
  const payDate = new Date(invoiceDate);
  const daysToAdd = amount > 1000 ? 30 : amount > 200 ? 14 : 7;
  payDate.setUTCDate(payDate.getUTCDate() + daysToAdd);
  return payDate;
}

/**
 * Produces a recommend-only AP decision (never executes payment).
 *
 * @param input - Invoice amount, date, and duplicate flag.
 * @returns Recommendation metadata for audit and UI.
 */
export function recommendApPayment(input: ApRecommendInput): ApRecommendation {
  if (input.isDuplicate) {
    return {
      status: "duplicate_refused",
      recommendedPayDateIso: input.invoiceDateIso,
      fundingSource: FUNDING_CARD_PAY,
      rationale: "Duplicate invoice detected (vendor + amount + date). No payment recommended.",
      wouldExecutePayment: false,
    };
  }

  const amount = Number.parseFloat(input.amount);
  const invoiceDate = new Date(input.invoiceDateIso);
  const payDate = computeRecommendedPayDate(invoiceDate, Number.isNaN(amount) ? 0 : amount);
  const fundingSource = amount > 1000 ? FUNDING_PAY_OPTIMIZE : FUNDING_CARD_PAY;

  return {
    status: "recommend",
    recommendedPayDateIso: payDate.toISOString(),
    fundingSource,
    rationale:
      amount > 1000
        ? "Large invoice — recommend Pay Optimize in 30 days for cash efficiency."
        : amount > 200
          ? "Mid-size invoice — recommend Card Pay in 14 days."
          : "Small invoice — recommend Card Pay in 7 days.",
    wouldExecutePayment: false,
  };
}
