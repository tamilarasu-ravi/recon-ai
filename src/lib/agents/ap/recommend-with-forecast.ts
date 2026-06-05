import {
  buildApRationaleFromForecast,
  type ApCashForecast,
} from "@/lib/agents/ap/cash-forecast";
import { recommendApPayment, type ApRecommendation } from "@/lib/agents/ap/recommend";

export interface ApRecommendationWithForecast extends ApRecommendation {
  cashForecast: ApCashForecast;
}

export interface RecommendApWithForecastInput {
  amount: string;
  currency: string;
  invoiceDateIso: string;
  isDuplicate: boolean;
  cashForecast: ApCashForecast;
}

/**
 * Wraps recommendApPayment with forecast-aware deterministic rationale.
 *
 * @param input - Invoice fields plus precomputed forecast (numbers fixed before narrative).
 * @returns AP recommendation with cashForecast attached.
 */
export function recommendApPaymentWithForecast(
  input: RecommendApWithForecastInput,
): ApRecommendationWithForecast {
  const base = recommendApPayment({
    amount: input.amount,
    currency: input.currency,
    invoiceDateIso: input.invoiceDateIso,
    isDuplicate: input.isDuplicate,
  });

  if (base.status === "duplicate_refused") {
    return { ...base, cashForecast: input.cashForecast };
  }

  return {
    ...base,
    cashForecast: input.cashForecast,
    rationale: buildApRationaleFromForecast(
      input.amount,
      input.currency,
      base.recommendedPayDateIso,
      base.fundingSource,
      input.cashForecast,
    ),
  };
}
