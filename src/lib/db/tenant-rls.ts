import { sql } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { getRootDb, runInRlsDbScope } from "@/lib/db/client";

const RLS_BYPASS_SETTING = "app.rls_bypass";
const RLS_TENANT_SETTING = "app.tenant_id";
/**
 * Sets a transaction-local GUC for the remainder of the current transaction.
 *
 * @param tx - Drizzle transaction client.
 * @param key - Postgres setting name.
 * @param value - Setting value.
 */
async function setLocalConfig(
  tx: DbClient,
  key: string,
  value: string,
): Promise<void> {
  await tx.execute(sql`SELECT set_config(${key}, ${value}, true)`);
}

/**
 * Uses recon_app when connected as postgres so FORCE RLS policies apply in dev.
 *
 * @param tx - Scoped transaction client.
 */
async function assumeRlsEnforcedRole(tx: DbClient): Promise<void> {
  if (process.env.RLS_USE_APP_ROLE === "false") {
    return;
  }
  try {
    await tx.execute(sql`SET LOCAL ROLE recon_app`);
  } catch {
    // Role missing (e.g. Neon app user already non-superuser) — no-op.
  }
}

/**
 * Runs work with Postgres RLS scoped to one tenant (SET LOCAL app.tenant_id).
 *
 * @param tenantId - Tenant UUID for policies.
 * @param fn - Callback; use getDb() for queries inside the scope.
 * @returns Result of the callback.
 */
export async function runWithTenantRls<T>(
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const db = getRootDb();
  return db.transaction(async (tx) => {
    await assumeRlsEnforcedRole(tx);
    await setLocalConfig(tx, RLS_TENANT_SETTING, tenantId);
    return runInRlsDbScope(tx, fn);
  });
}

/**
 * Runs work with RLS bypass for cron, seed, eval, and auth key lookup.
 *
 * @param fn - Callback that may touch multiple tenants.
 * @returns Result of the callback.
 */
export async function runWithRlsBypass<T>(fn: () => Promise<T>): Promise<T> {
  const db = getRootDb();
  return db.transaction(async (tx) => {
    await assumeRlsEnforcedRole(tx);
    await setLocalConfig(tx, RLS_BYPASS_SETTING, "true");
    return runInRlsDbScope(tx, fn);
  });
}
