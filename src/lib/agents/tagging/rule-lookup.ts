import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { vendorRules } from "@/lib/db/schema";

export interface VendorRuleHit {
  ruleHit: true;
  glAccountId: string;
  taxCode: string | null;
}

export type VendorRuleLookupResult = VendorRuleHit | { ruleHit: false };

/**
 * Looks up a per-tenant vendor rule for deterministic GL assignment.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param vendorId - Resolved vendor UUID.
 * @returns Rule hit with GL account or ruleHit=false.
 */
export async function lookupVendorRule(
  db: DbClient,
  tenantId: string,
  vendorId: string,
): Promise<VendorRuleLookupResult> {
  const rows = await db
    .select({
      glAccountId: vendorRules.glAccountId,
      taxCode: vendorRules.taxCode,
    })
    .from(vendorRules)
    .where(and(eq(vendorRules.tenantId, tenantId), eq(vendorRules.vendorId, vendorId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return { ruleHit: false };
  }

  return {
    ruleHit: true,
    glAccountId: row.glAccountId,
    taxCode: row.taxCode,
  };
}
