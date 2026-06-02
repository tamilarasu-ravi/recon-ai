import { eq } from "drizzle-orm";

import { generateWebhookSecretMaterial } from "@/lib/auth/webhook-secret-crypto";
import type { DbClient } from "@/lib/db/client";
import { tenants, webhookSecrets } from "@/lib/db/schema";

export interface SeededWebhookSecret {
  tenantSlug: string;
  name: string;
  rawSecret: string;
  secretPrefix: string;
}

/**
 * Creates a default webhook signing secret per tenant when none exist (idempotent).
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug to seed.
 * @returns New secret material when created, or null when tenant already has a secret.
 */
export async function seedWebhookSecretForTenant(
  db: DbClient,
  tenantSlug: string,
): Promise<SeededWebhookSecret | null> {
  const tenantRows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);

  const tenantId = tenantRows[0]?.id;
  if (!tenantId) {
    return null;
  }

  const existing = await db
    .select({ id: webhookSecrets.id })
    .from(webhookSecrets)
    .where(eq(webhookSecrets.tenantId, tenantId))
    .limit(1);

  if (existing[0]) {
    return null;
  }

  const { rawSecret, secretPrefix } = generateWebhookSecretMaterial();

  await db.insert(webhookSecrets).values({
    tenantId,
    name: `${tenantSlug} webhook`,
    secretPrefix,
    signingSecret: rawSecret,
    isActive: true,
  });

  return {
    tenantSlug,
    name: `${tenantSlug} webhook`,
    rawSecret,
    secretPrefix,
  };
}
