#!/usr/bin/env tsx
/**
 * Deletes all API keys and issues new ones (prints raw recon_… secrets once).
 * Dev/local only — do not use in production.
 *
 * Usage: pnpm auth:reset-keys
 */

import { config as loadDotenv } from "dotenv";
import { eq } from "drizzle-orm";

import { createApiKeyForTenant } from "@/lib/auth/api-keys-admin";
import { isProductionDeployment } from "@/lib/config/runtime";
import { createDb } from "@/lib/db/client";
import { apiKeys, tenants } from "@/lib/db/schema";
import { runCliScript } from "./lib/close-cli-resources.js";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

/**
 * Rotates API keys for every tenant and prints new secrets to stdout.
 */
async function main(): Promise<void> {
  if (isProductionDeployment()) {
    console.error("auth:reset-keys is disabled when NODE_ENV=production or VERCEL_ENV=production.");
    process.exit(1);
  }

  const db = createDb();
  const tenantRows = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants);

  console.log("Resetting API keys for all tenants…\n");

  for (const tenant of tenantRows) {
    await db.delete(apiKeys).where(eq(apiKeys.tenantId, tenant.id));

    const created = await createApiKeyForTenant(db, tenant.id, `${tenant.slug}-dev`);

    console.log(`${tenant.slug}:`);
    console.log(`  ${created.rawKey}`);
    console.log("");
  }

  console.log("Done. In the browser: Settings → paste key → Save for this browser → reload.");
}

runCliScript(main);
