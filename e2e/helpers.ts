import type { APIRequestContext } from "@playwright/test";

export interface TenantOption {
  id: string;
  slug: string;
  name: string;
}

/**
 * Resolves tenant-a UUID from the public tenants API (auth off in E2E).
 *
 * @param request - Playwright API request context.
 * @returns Tenant UUID for Acme Labs seed tenant.
 * @throws Error when tenant-a is missing from seed data.
 */
export async function getTenantAId(request: APIRequestContext): Promise<string> {
  const response = await request.get("/api/tenants");
  if (!response.ok()) {
    throw new Error(`Failed to load tenants: HTTP ${response.status()}`);
  }

  const body = (await response.json()) as { tenants: TenantOption[] };
  const tenant = body.tenants.find((row) => row.slug === "tenant-a");
  if (!tenant) {
    throw new Error("tenant-a not found — run pnpm db:seed");
  }

  return tenant.id;
}

/**
 * Ingests one transaction via REST API (sync) for E2E setup.
 *
 * @param request - Playwright API request context.
 * @param tenantId - Tenant UUID.
 * @param vendorRaw - Raw vendor string (use MYSTERY for REFUSE → review queue).
 * @returns Created transaction id from ingest response.
 */
export async function ingestTransactionForE2E(
  request: APIRequestContext,
  tenantId: string,
  vendorRaw: string,
): Promise<string> {
  const externalId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const response = await request.post("/api/ingest/transactions", {
    data: {
      tenant_id: tenantId,
      external_transaction_id: externalId,
      transaction_timestamp: new Date().toISOString(),
      amount: "88.00",
      currency: "USD",
      vendor_raw: vendorRaw,
      memo: "Playwright E2E",
    },
  });

  const body = (await response.json()) as { transactionId?: string; error?: string };
  if (!response.ok() || !body.transactionId) {
    throw new Error(body.error ?? `Ingest failed HTTP ${response.status()}`);
  }

  return body.transactionId;
}
