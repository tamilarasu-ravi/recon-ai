import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_SEPARATOR = ".";

export interface QuickBooksOAuthStatePayload {
  tenantId: string;
  nonce: string;
}

/**
 * Signs an OAuth state payload for the QuickBooks connect callback.
 *
 * @param payload - Tenant and nonce to embed in state.
 * @param secret - HMAC secret (client secret).
 * @returns URL-safe state string.
 */
export function signQuickBooksOAuthState(
  payload: QuickBooksOAuthStatePayload,
  secret: string,
): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}${STATE_SEPARATOR}${signature}`;
}

/**
 * Verifies and parses a signed QuickBooks OAuth state parameter.
 *
 * @param state - State query param from Intuit redirect.
 * @param secret - HMAC secret (client secret).
 * @returns Parsed payload when valid.
 * @throws Error when signature or payload is invalid.
 */
export function verifyQuickBooksOAuthState(
  state: string,
  secret: string,
): QuickBooksOAuthStatePayload {
  const parts = state.split(STATE_SEPARATOR);
  if (parts.length !== 2) {
    throw new Error("Invalid OAuth state format");
  }

  const [encoded, signature] = parts;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid OAuth state signature");
  }

  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as QuickBooksOAuthStatePayload;
  if (!parsed.tenantId || !parsed.nonce) {
    throw new Error("Invalid OAuth state payload");
  }

  return parsed;
}

/**
 * Creates a fresh nonce for OAuth state.
 *
 * @returns Random hex nonce.
 */
export function newOAuthStateNonce(): string {
  return randomBytes(16).toString("hex");
}
