import { and, eq } from "drizzle-orm";

import { generateWebhookSecretMaterial } from "@/lib/auth/webhook-secret-crypto";
import type { DbClient } from "@/lib/db/client";
import { tenants, webhookSecrets } from "@/lib/db/schema";
import { verifyWebhookSignature } from "@/lib/integrations/webhooks/verify-signature";

export interface WebhookSecretListItemDto {
  id: string;
  name: string;
  secretPrefix: string;
  isActive: boolean;
  createdAt: string;
}

/**
 * Lists webhook signing secrets for a tenant (never returns signing material).
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Masked secret list.
 */
export async function listWebhookSecretsForTenant(
  db: DbClient,
  tenantId: string,
): Promise<WebhookSecretListItemDto[]> {
  const rows = await db
    .select({
      id: webhookSecrets.id,
      name: webhookSecrets.name,
      secretPrefix: webhookSecrets.secretPrefix,
      isActive: webhookSecrets.isActive,
      createdAt: webhookSecrets.createdAt,
    })
    .from(webhookSecrets)
    .where(eq(webhookSecrets.tenantId, tenantId));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    secretPrefix: row.secretPrefix,
    isActive: row.isActive,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(String(row.createdAt)).toISOString(),
  }));
}

/**
 * Creates a webhook signing secret for a tenant; returns raw secret once.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param name - Human-readable label.
 * @returns List item plus raw secret for one-time display.
 */
export async function createWebhookSecretForTenant(
  db: DbClient,
  tenantId: string,
  name: string,
): Promise<WebhookSecretListItemDto & { rawSecret: string }> {
  const { rawSecret, secretPrefix } = generateWebhookSecretMaterial();

  const [inserted] = await db
    .insert(webhookSecrets)
    .values({
      tenantId,
      name,
      secretPrefix,
      signingSecret: rawSecret,
      isActive: true,
    })
    .returning({
      id: webhookSecrets.id,
      name: webhookSecrets.name,
      secretPrefix: webhookSecrets.secretPrefix,
      isActive: webhookSecrets.isActive,
      createdAt: webhookSecrets.createdAt,
    });

  return {
    id: inserted.id,
    name: inserted.name,
    secretPrefix: inserted.secretPrefix,
    isActive: inserted.isActive,
    createdAt:
      inserted.createdAt instanceof Date
        ? inserted.createdAt.toISOString()
        : new Date(String(inserted.createdAt)).toISOString(),
    rawSecret,
  };
}

/**
 * Loads an active webhook signing secret for a tenant slug (local CLI demos only).
 *
 * @param db - Database client.
 * @param tenantSlug - Tenant slug (e.g. tenant-a).
 * @returns Raw signing secret or null when tenant or secret is missing.
 */
export async function loadWebhookSigningSecretForTenantSlug(
  db: DbClient,
  tenantSlug: string,
): Promise<string | null> {
  const tenantRows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);

  const tenantId = tenantRows[0]?.id;
  if (!tenantId) {
    return null;
  }

  const rows = await db
    .select({ signingSecret: webhookSecrets.signingSecret })
    .from(webhookSecrets)
    .where(and(eq(webhookSecrets.tenantId, tenantId), eq(webhookSecrets.isActive, true)))
    .limit(1);

  return rows[0]?.signingSecret ?? null;
}

/**
 * Verifies a webhook request against any active signing secret for the tenant.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID from URL slug resolution.
 * @param rawBody - Exact request body string.
 * @param signatureHeader - X-Recon-Signature header value.
 * @param toleranceSec - Replay protection window in seconds.
 * @returns True when any active secret validates the signature.
 */
export async function verifyWebhookSignatureForTenant(
  db: DbClient,
  tenantId: string,
  rawBody: string,
  signatureHeader: string | null,
  toleranceSec: number,
): Promise<boolean> {
  const rows = await db
    .select({ signingSecret: webhookSecrets.signingSecret })
    .from(webhookSecrets)
    .where(and(eq(webhookSecrets.tenantId, tenantId), eq(webhookSecrets.isActive, true)));

  for (const row of rows) {
    if (verifyWebhookSignature(row.signingSecret, rawBody, signatureHeader, toleranceSec)) {
      return true;
    }
  }

  return false;
}
