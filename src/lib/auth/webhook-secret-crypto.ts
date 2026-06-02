import { randomBytes } from "node:crypto";

const WEBHOOK_SECRET_PREFIX = "whsec";

/**
 * Generates a webhook signing secret for HMAC verification.
 *
 * @returns Raw secret (show once) and display prefix.
 */
export function generateWebhookSecretMaterial(): {
  rawSecret: string;
  secretPrefix: string;
} {
  const secret = randomBytes(24).toString("base64url");
  const rawSecret = `${WEBHOOK_SECRET_PREFIX}_${secret}`;
  const secretPrefix = rawSecret.slice(0, 14);

  return { rawSecret, secretPrefix };
}
