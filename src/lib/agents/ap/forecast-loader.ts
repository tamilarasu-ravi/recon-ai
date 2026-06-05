import { eq } from "drizzle-orm";

import {
  AP_DEFAULT_AVAILABLE_CASH_USD,
  buildApCashForecast,
  type ApCashForecast,
  type ApCashForecastInvoice,
} from "@/lib/agents/ap/cash-forecast";
import type { DbClient } from "@/lib/db/client";
import { apRecommendations, invoices } from "@/lib/db/schema";

/**
 * Reads configured available cash for AP forecast math.
 *
 * @returns USD balance from AP_AVAILABLE_CASH_USD or default mock balance.
 */
export function resolveAvailableCashUsd(): number {
  const raw = process.env.AP_AVAILABLE_CASH_USD?.trim();
  if (!raw) {
    return AP_DEFAULT_AVAILABLE_CASH_USD;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : AP_DEFAULT_AVAILABLE_CASH_USD;
}

/**
 * Loads open invoice pay dates for tenant-level cash forecast.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Invoice amounts and latest recommended pay dates.
 */
export async function loadOpenApInvoicesForForecast(
  db: DbClient,
  tenantId: string,
): Promise<ApCashForecastInvoice[]> {
  const rows = await db
    .select({
      invoiceId: invoices.id,
      amount: invoices.amount,
      recommendedPayDate: apRecommendations.recommendedPayDate,
    })
    .from(invoices)
    .leftJoin(apRecommendations, eq(apRecommendations.invoiceId, invoices.id))
    .where(eq(invoices.tenantId, tenantId));

  const byInvoice = new Map<string, ApCashForecastInvoice>();

  for (const row of rows) {
    const amount = String(row.amount);
    const payDate =
      row.recommendedPayDate instanceof Date
        ? row.recommendedPayDate.toISOString()
        : row.recommendedPayDate
          ? new Date(String(row.recommendedPayDate)).toISOString()
          : new Date().toISOString();

    byInvoice.set(row.invoiceId, {
      amount,
      recommendedPayDateIso: payDate,
    });
  }

  return [...byInvoice.values()];
}

export interface TenantApCashForecastOptions {
  pendingAmount?: string;
  pendingPayDateIso?: string;
}

/**
 * Builds tenant AP cash forecast including an optional pending invoice from the current run.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param options - Optional pending invoice for runway calculation.
 * @returns Forecast snapshot.
 */
export async function buildTenantApCashForecast(
  db: DbClient,
  tenantId: string,
  options?: TenantApCashForecastOptions,
): Promise<ApCashForecast> {
  const openInvoices = await loadOpenApInvoicesForForecast(db, tenantId);
  const pendingInvoice =
    options?.pendingAmount && options.pendingPayDateIso
      ? {
          amount: options.pendingAmount,
          recommendedPayDateIso: options.pendingPayDateIso,
        }
      : undefined;

  return buildApCashForecast({
    openInvoices,
    availableCashUsd: resolveAvailableCashUsd(),
    pendingInvoice,
  });
}
