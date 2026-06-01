import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { vendorAliases, vendors } from "@/lib/db/schema";

export interface VendorNormalizeResult {
  vendorId: string | null;
  canonicalName: string;
  isNewVendor: boolean;
}

/**
 * Normalizes a raw vendor string and resolves tenant-scoped vendor_id via aliases.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param vendorRaw - Raw vendor name from transaction.
 * @returns Canonical vendor id (nullable for unknown), name, and new-vendor flag.
 */
export async function normalizeVendor(
  db: DbClient,
  tenantId: string,
  vendorRaw: string,
): Promise<VendorNormalizeResult> {
  const normalized = vendorRaw.trim().toLowerCase().replace(/\s+/g, " ");

  const aliasMatch = await db
    .select({
      vendorId: vendorAliases.vendorId,
      canonicalName: vendors.canonicalName,
    })
    .from(vendorAliases)
    .innerJoin(vendors, eq(vendorAliases.vendorId, vendors.id))
    .where(and(eq(vendorAliases.tenantId, tenantId), eq(vendorAliases.aliasRaw, normalized)))
    .limit(1);

  if (aliasMatch[0]) {
    return {
      vendorId: aliasMatch[0].vendorId,
      canonicalName: aliasMatch[0].canonicalName,
      isNewVendor: false,
    };
  }

  const vendorMatch = await db
    .select({ id: vendors.id, canonicalName: vendors.canonicalName })
    .from(vendors)
    .where(and(eq(vendors.tenantId, tenantId), eq(vendors.canonicalName, normalized)))
    .limit(1);

  if (vendorMatch[0]) {
    await db.insert(vendorAliases).values({
      tenantId,
      vendorId: vendorMatch[0].id,
      aliasRaw: normalized,
    });
    return {
      vendorId: vendorMatch[0].id,
      canonicalName: vendorMatch[0].canonicalName,
      isNewVendor: false,
    };
  }

  return {
    vendorId: null,
    canonicalName: normalized,
    isNewVendor: true,
  };
}
