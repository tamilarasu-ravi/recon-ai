import type { DbClient } from "@/lib/db/client";
import { MockErpAdapter } from "@/lib/integrations/erp/mock-adapter";
import { QuickBooksSandboxAdapter } from "@/lib/integrations/erp/quickbooks/adapter";
import { getErpConnection } from "@/lib/integrations/erp/erp-connections";
import { QUICKBOOKS_PROVIDER_ID } from "@/lib/integrations/erp/quickbooks/config";
import type { ErpAdapter } from "@/lib/integrations/erp/types";

/**
 * Resolves the ERP adapter for a tenant based on env and stored OAuth connections.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns ERP adapter instance.
 */
export async function getErpAdapterForTenant(
  db: DbClient,
  tenantId: string,
): Promise<ErpAdapter> {
  const provider = process.env.ERP_PROVIDER?.trim().toLowerCase() ?? "mock";

  if (provider === "quickbooks_sandbox") {
    const connection = await getErpConnection(db, tenantId, QUICKBOOKS_PROVIDER_ID);
    if (connection) {
      return new QuickBooksSandboxAdapter(db, tenantId);
    }
  }

  return new MockErpAdapter();
}

/**
 * Resolves the configured ERP adapter from environment (legacy, no tenant context).
 *
 * @returns ERP adapter instance (mock by default).
 */
export function getErpAdapter(): ErpAdapter {
  return new MockErpAdapter();
}
