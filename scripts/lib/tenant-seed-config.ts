import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { chartOfAccounts, tenants, vendorRules, vendors } from "@/lib/db/schema";

export const TENANT_SEED = [
  {
    slug: "tenant-a",
    name: "Acme Labs",
    coa: [
      { glCode: "6100", glName: "Software & Cloud" },
      { glCode: "6200", glName: "Professional Services" },
      { glCode: "6300", glName: "Travel & Entertainment" },
      { glCode: "6400", glName: "Office Supplies" },
    ],
    vendorAliases: [
      { alias: "aws", canonical: "aws", glCode: "6100" },
      { alias: "amazon web services", canonical: "aws", glCode: "6100" },
      { alias: "slack", canonical: "slack", glCode: "6100" },
      { alias: "starbucks", canonical: "starbucks", glCode: "6300" },
    ],
    labeledTxns: [
      { vendor: "aws", amount: "240.00", memo: "ec2 hosting", glCode: "6100" },
      { vendor: "aws", amount: "89.50", memo: "s3 storage", glCode: "6100" },
      { vendor: "slack", amount: "45.00", memo: "team plan", glCode: "6100" },
      { vendor: "starbucks", amount: "18.20", memo: "team coffee", glCode: "6300" },
      { vendor: "starbucks", amount: "22.10", memo: "client meeting", glCode: "6300" },
      { vendor: "slack", amount: "120.00", memo: "annual", glCode: "6100" },
      { vendor: "aws", amount: "310.00", memo: "rds", glCode: "6100" },
      { vendor: "aws", amount: "55.00", memo: "lambda", glCode: "6100" },
      { vendor: "slack", amount: "48.00", memo: "add seats", glCode: "6100" },
      { vendor: "starbucks", amount: "15.00", memo: "snacks", glCode: "6300" },
      { vendor: "aws", amount: "199.00", memo: "cloudfront", glCode: "6100" },
      { vendor: "slack", amount: "52.00", memo: "pro plan", glCode: "6100" },
    ],
  },
  {
    slug: "tenant-b",
    name: "Northwind Trading",
    coa: [
      { glCode: "5100", glName: "COGS — Materials" },
      { glCode: "5200", glName: "Logistics" },
      { glCode: "5300", glName: "Marketing" },
      { glCode: "5400", glName: "Facilities" },
    ],
    vendorAliases: [
      { alias: "fedex", canonical: "fedex", glCode: "5200" },
      { alias: "google ads", canonical: "google ads", glCode: "5300" },
      { alias: "staples", canonical: "staples", glCode: "5400" },
    ],
    labeledTxns: [
      { vendor: "fedex", amount: "120.00", memo: "shipping", glCode: "5200" },
      { vendor: "google ads", amount: "500.00", memo: "campaign", glCode: "5300" },
      { vendor: "staples", amount: "45.00", memo: "supplies", glCode: "5400" },
      { vendor: "fedex", amount: "88.00", memo: "freight", glCode: "5200" },
      { vendor: "google ads", amount: "300.00", memo: "retargeting", glCode: "5300" },
      { vendor: "staples", amount: "32.00", memo: "paper", glCode: "5400" },
      { vendor: "fedex", amount: "64.00", memo: "overnight", glCode: "5200" },
      { vendor: "google ads", amount: "250.00", memo: "search", glCode: "5300" },
      { vendor: "staples", amount: "28.00", memo: "ink", glCode: "5400" },
      { vendor: "fedex", amount: "95.00", memo: "logistics", glCode: "5200" },
      { vendor: "google ads", amount: "180.00", memo: "display", glCode: "5300" },
      { vendor: "staples", amount: "40.00", memo: "folders", glCode: "5400" },
    ],
  },
] as const;

export type TenantSeedConfig = (typeof TENANT_SEED)[number];

/**
 * Builds canonical vendor → seed GL code map for one tenant fixture.
 *
 * @param tenantSeed - Tenant seed config row.
 * @returns Map of canonical vendor name to expected GL code.
 */
function canonicalGlMapForTenant(tenantSeed: TenantSeedConfig): Map<string, string> {
  const canonicalToGl = new Map<string, string>();
  for (const vendorSeed of tenantSeed.vendorAliases) {
    if (!canonicalToGl.has(vendorSeed.canonical)) {
      canonicalToGl.set(vendorSeed.canonical, vendorSeed.glCode);
    }
  }
  return canonicalToGl;
}

/**
 * Upserts seeded vendor rules so demo overrides cannot drift eval baselines.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param tenantSeed - Tenant seed config row.
 * @returns Number of vendor_rules rows inserted or updated.
 */
export async function syncSeedVendorRulesForTenant(
  db: DbClient,
  tenantId: string,
  tenantSeed: TenantSeedConfig,
): Promise<number> {
  const canonicalToGl = canonicalGlMapForTenant(tenantSeed);
  let changed = 0;

  for (const [canonical, glCode] of canonicalToGl) {
    const [vendorRow] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(and(eq(vendors.tenantId, tenantId), eq(vendors.canonicalName, canonical)))
      .limit(1);

    const vendorId = vendorRow?.id;
    if (!vendorId) {
      continue;
    }

    const [coaRow] = await db
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.glCode, glCode)))
      .limit(1);

    const glAccountId = coaRow?.id;
    if (!glAccountId) {
      continue;
    }

    const [existingRule] = await db
      .select({ id: vendorRules.id, glAccountId: vendorRules.glAccountId })
      .from(vendorRules)
      .where(and(eq(vendorRules.tenantId, tenantId), eq(vendorRules.vendorId, vendorId)))
      .limit(1);

    if (!existingRule) {
      await db.insert(vendorRules).values({ tenantId, vendorId, glAccountId });
      changed += 1;
      continue;
    }

    if (existingRule.glAccountId !== glAccountId) {
      await db
        .update(vendorRules)
        .set({ glAccountId })
        .where(eq(vendorRules.id, existingRule.id));
      changed += 1;
    }
  }

  return changed;
}

/**
 * Restores all seeded vendor rules across demo tenants before eval runs.
 *
 * @param db - Database client.
 * @returns Total vendor_rules rows inserted or updated.
 */
export async function syncAllSeedVendorRules(db: DbClient): Promise<number> {
  let changed = 0;

  for (const tenantSeed of TENANT_SEED) {
    const [tenantRow] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, tenantSeed.slug))
      .limit(1);

    const tenantId = tenantRow?.id;
    if (!tenantId) {
      continue;
    }

    changed += await syncSeedVendorRulesForTenant(db, tenantId, tenantSeed);
  }

  return changed;
}
