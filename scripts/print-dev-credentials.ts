#!/usr/bin/env tsx
/**
 * Prints dev credential hints after seed (prefixes only — raw secrets are not stored in DB).
 *
 * Usage: pnpm auth:print-hints
 */

import { config as loadDotenv } from "dotenv";
import { eq } from "drizzle-orm";

import { createDb } from "@/lib/db/client";
import { apiKeys, tenants, webhookSecrets } from "@/lib/db/schema";
import { runCliScript } from "./lib/close-cli-resources.js";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

/**
 * Logs API key and webhook secret prefixes per tenant slug.
 */
async function main(): Promise<void> {
  const db = createDb();
  const tenantRows = await db.select().from(tenants);

  console.log("ReconAI dev credentials (prefixes only — full secrets are not in the database)\n");

  for (const tenant of tenantRows) {
    const keys = await db
      .select({ name: apiKeys.name, keyPrefix: apiKeys.keyPrefix })
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, tenant.id));

    const secrets = await db
      .select({ name: webhookSecrets.name, secretPrefix: webhookSecrets.secretPrefix })
      .from(webhookSecrets)
      .where(eq(webhookSecrets.tenantId, tenant.id));

    console.log(`${tenant.slug} (${tenant.name})`);
    if (keys.length === 0) {
      console.log("  API keys: none — use Settings → Generate key, or pnpm db:seed");
    } else {
      for (const key of keys) {
        console.log(`  API key: ${key.name} · prefix ${key.keyPrefix}…`);
      }
      console.log(
        "  → Full recon_… key was printed once when seed created it. Re-run after: DELETE FROM api_keys;",
      );
    }
    if (secrets.length > 0) {
      for (const secret of secrets) {
        console.log(`  Webhook: ${secret.name} · prefix ${secret.secretPrefix}…`);
      }
    }
    console.log("");
  }
}

runCliScript(main);
