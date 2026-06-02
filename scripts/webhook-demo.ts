import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";

import { loadWebhookSigningSecretForTenantSlug } from "@/lib/auth/webhook-secrets-admin";
import { seedWebhookSecretForTenant } from "@/lib/auth/seed-webhook-secrets";
import { createDb } from "@/lib/db/client";
import { buildWebhookSignatureHeader } from "@/lib/integrations/webhooks/verify-signature";
import { runCliScript } from "./lib/close-cli-resources.js";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const DEFAULT_BASE_URL = "http://localhost:3000";

/**
 * Resolves webhook signing material from env or the database (local dev).
 *
 * @param tenantSlug - Tenant slug for DB lookup.
 * @returns Raw whsec signing secret.
 * @throws Error when no secret is available.
 */
async function resolveWebhookSigningSecret(tenantSlug: string): Promise<string> {
  const fromEnv = process.env.WEBHOOK_DEMO_SECRET?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const db = createDb();
  let secret = await loadWebhookSigningSecretForTenantSlug(db, tenantSlug);

  if (!secret) {
    const seeded = await seedWebhookSecretForTenant(db, tenantSlug);
    secret = seeded?.rawSecret ?? null;
    if (seeded) {
      console.log(
        `Created webhook secret for ${tenantSlug} (${seeded.secretPrefix}…) — re-run seed logs whsec only on first create.`,
      );
    }
  } else {
    console.log(`Using webhook signing secret from database for ${tenantSlug} (local dev).`);
  }

  if (!secret) {
    throw new Error(
      `No webhook secret for ${tenantSlug}. Run: pnpm db:migrate && pnpm db:seed\n` +
        "Or set WEBHOOK_DEMO_SECRET=whsec_… from seed output / Settings.",
    );
  }

  return secret;
}

/**
 * Sends a signed webhook ingest request for tenant-a (or WEBHOOK_DEMO_TENANT_SLUG).
 *
 * @returns Promise that resolves when the HTTP call completes.
 * @throws Error when signing secret or HTTP request fails.
 */
async function main(): Promise<void> {
  const baseUrl = process.env.WEBHOOK_DEMO_BASE_URL?.trim() ?? DEFAULT_BASE_URL;
  const tenantSlug = process.env.WEBHOOK_DEMO_TENANT_SLUG?.trim() ?? "tenant-a";
  const rawSecret = await resolveWebhookSigningSecret(tenantSlug);
  const runId = randomUUID().slice(0, 8);

  const payload = {
    external_transaction_id: `webhook-demo-${runId}`,
    transaction_timestamp: new Date().toISOString(),
    amount: "42.00",
    currency: "USD",
    vendor_raw: "Slack",
    memo: "Signed webhook demo",
  };

  const rawBody = JSON.stringify(payload);
  const { header } = buildWebhookSignatureHeader(rawSecret, rawBody);

  const url = `${baseUrl}/api/webhooks/transactions?tenant_slug=${encodeURIComponent(tenantSlug)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Recon-Signature": header,
    },
    body: rawBody,
  });

  const body = await response.text();
  console.log(`POST ${url}`);
  console.log(`Status: ${response.status}`);
  console.log(body);

  if (!response.ok) {
    process.exit(1);
  }
}

runCliScript(main);
