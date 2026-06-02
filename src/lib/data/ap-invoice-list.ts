import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { auditLog, apRecommendations, events, invoices } from "@/lib/db/schema";

export interface ApInvoiceListItemDto {
  id: string;
  externalInvoiceId: string;
  vendorRaw: string;
  amount: string;
  currency: string;
  invoiceDate: string;
  hasRecommendation: boolean;
  recommendedPayDate: string | null;
  fundingSource: string | null;
  recommendationRationale: string | null;
}

export interface ApInvoiceRelatedDto {
  id: string;
  externalInvoiceId: string;
  vendorRaw: string;
  amount: string;
  invoiceDate: string;
}

export interface ApInvoiceAuditDto {
  runId: string;
  agent: string;
  observability: unknown;
  createdAt: string;
}

export interface ApInvoiceEventDto {
  eventType: string;
  runId: string;
  payload: unknown;
  createdAt: string;
}

export interface ApInvoiceDetailDto extends ApInvoiceListItemDto {
  runId: string | null;
  createdAt: string;
  auditTrail: ApInvoiceAuditDto[];
  domainEvents: ApInvoiceEventDto[];
  relatedInvoices: ApInvoiceRelatedDto[];
  duplicateOfExternalId: string | null;
  duplicateOfInvoiceId: string | null;
}

/**
 * Lists invoices for a tenant with latest AP recommendation when present.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Invoice rows for the AP inbox UI.
 */
export async function listApInvoicesForTenant(
  db: DbClient,
  tenantId: string,
): Promise<ApInvoiceListItemDto[]> {
  const rows = await db
    .select({
      id: invoices.id,
      externalInvoiceId: invoices.externalInvoiceId,
      vendorRaw: invoices.vendorRaw,
      amount: invoices.amount,
      currency: invoices.currency,
      invoiceDate: invoices.invoiceDate,
      recommendationId: apRecommendations.id,
      recommendedPayDate: apRecommendations.recommendedPayDate,
      fundingSource: apRecommendations.fundingSource,
      rationale: apRecommendations.rationale,
    })
    .from(invoices)
    .leftJoin(apRecommendations, eq(apRecommendations.invoiceId, invoices.id))
    .where(eq(invoices.tenantId, tenantId))
    .orderBy(desc(invoices.invoiceDate));

  return rows.map((row) => ({
    id: row.id,
    externalInvoiceId: row.externalInvoiceId,
    vendorRaw: row.vendorRaw,
    amount: String(row.amount),
    currency: row.currency,
    invoiceDate:
      row.invoiceDate instanceof Date
        ? row.invoiceDate.toISOString()
        : new Date(String(row.invoiceDate)).toISOString(),
    hasRecommendation: Boolean(row.recommendationId),
    recommendedPayDate: row.recommendedPayDate
      ? row.recommendedPayDate instanceof Date
        ? row.recommendedPayDate.toISOString()
        : new Date(String(row.recommendedPayDate)).toISOString()
      : null,
    fundingSource: row.fundingSource,
    recommendationRationale: row.rationale,
  }));
}

/**
 * Loads one invoice and its recommendation for the detail view.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param invoiceId - Invoice UUID.
 * @returns Detail DTO or null when not found.
 */
export async function getApInvoiceDetail(
  db: DbClient,
  tenantId: string,
  invoiceId: string,
): Promise<ApInvoiceDetailDto | null> {
  const rows = await db
    .select({
      id: invoices.id,
      externalInvoiceId: invoices.externalInvoiceId,
      vendorRaw: invoices.vendorRaw,
      amount: invoices.amount,
      currency: invoices.currency,
      invoiceDate: invoices.invoiceDate,
      createdAt: invoices.createdAt,
      recommendationId: apRecommendations.id,
      recommendedPayDate: apRecommendations.recommendedPayDate,
      fundingSource: apRecommendations.fundingSource,
      rationale: apRecommendations.rationale,
      runId: apRecommendations.runId,
    })
    .from(invoices)
    .leftJoin(apRecommendations, eq(apRecommendations.invoiceId, invoices.id))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const auditRows = await db
    .select({
      runId: auditLog.runId,
      agent: auditLog.agent,
      observability: auditLog.observability,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.invoiceId, invoiceId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(10);

  const runIds = [
    ...new Set(
      auditRows.map((audit) => audit.runId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const eventFilter =
    runIds.length > 0
      ? or(
          sql`${events.payload}->>'invoice_id' = ${invoiceId}`,
          inArray(events.runId, runIds),
        )
      : sql`${events.payload}->>'invoice_id' = ${invoiceId}`;

  const eventRows = await db
    .select({
      eventType: events.eventType,
      runId: events.runId,
      payload: events.payload,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eventFilter))
    .orderBy(desc(events.createdAt))
    .limit(20);

  const relatedRows = await db
    .select({
      id: invoices.id,
      externalInvoiceId: invoices.externalInvoiceId,
      vendorRaw: invoices.vendorRaw,
      amount: invoices.amount,
      invoiceDate: invoices.invoiceDate,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        ne(invoices.id, invoiceId),
        sql`lower(${invoices.vendorRaw}) = lower(${row.vendorRaw})`,
      ),
    )
    .orderBy(desc(invoices.invoiceDate))
    .limit(8);

  let duplicateOfExternalId: string | null = null;
  for (const audit of auditRows) {
    const obs = audit.observability;
    if (obs && typeof obs === "object" && "duplicate_of" in obs) {
      const value = (obs as { duplicate_of?: unknown }).duplicate_of;
      if (typeof value === "string") {
        duplicateOfExternalId = value;
        break;
      }
    }
  }

  let duplicateOfInvoiceId: string | null = null;
  if (duplicateOfExternalId) {
    const duplicateRows = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.externalInvoiceId, duplicateOfExternalId),
        ),
      )
      .limit(1);
    duplicateOfInvoiceId = duplicateRows[0]?.id ?? null;
  }

  const mapIso = (value: Date | string): string =>
    value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

  return {
    id: row.id,
    externalInvoiceId: row.externalInvoiceId,
    vendorRaw: row.vendorRaw,
    amount: String(row.amount),
    currency: row.currency,
    invoiceDate: mapIso(row.invoiceDate),
    createdAt: mapIso(row.createdAt),
    hasRecommendation: Boolean(row.recommendationId),
    recommendedPayDate: row.recommendedPayDate ? mapIso(row.recommendedPayDate) : null,
    fundingSource: row.fundingSource,
    recommendationRationale: row.rationale,
    runId: row.runId ?? null,
    auditTrail: auditRows.map((audit) => ({
      runId: audit.runId,
      agent: audit.agent,
      observability: audit.observability,
      createdAt: mapIso(audit.createdAt),
    })),
    domainEvents: eventRows.map((event) => ({
      eventType: event.eventType,
      runId: event.runId,
      payload: event.payload,
      createdAt: mapIso(event.createdAt),
    })),
    relatedInvoices: relatedRows.map((related) => ({
      id: related.id,
      externalInvoiceId: related.externalInvoiceId,
      vendorRaw: related.vendorRaw,
      amount: String(related.amount),
      invoiceDate: mapIso(related.invoiceDate),
    })),
    duplicateOfExternalId,
    duplicateOfInvoiceId,
  };
}
