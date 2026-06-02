import { createHash, randomBytes } from "node:crypto";

const API_KEY_PREFIX = "recon";

/**
 * Generates a new API key and its SHA-256 hash for storage.
 *
 * @returns Raw key (show once), display prefix, and hash for database.
 */
export function generateApiKeyMaterial(): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const secret = randomBytes(24).toString("base64url");
  const rawKey = `${API_KEY_PREFIX}_${secret}`;
  const keyPrefix = rawKey.slice(0, 12);
  const keyHash = hashApiKey(rawKey);

  return { rawKey, keyPrefix, keyHash };
}

/**
 * Hashes an API key for constant-time comparison against stored hash.
 *
 * @param rawKey - Bearer token value.
 * @returns Hex-encoded SHA-256 digest.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}
