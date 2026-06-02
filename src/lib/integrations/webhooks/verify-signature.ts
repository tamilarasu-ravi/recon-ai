import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_HEADER = "x-recon-signature";
const DEFAULT_TOLERANCE_SEC = 300;

export interface ParsedWebhookSignature {
  timestamp: string;
  signatureV1: string;
}

/**
 * Returns the canonical webhook signature header name.
 *
 * @returns Lowercase header name for documentation and clients.
 */
export function webhookSignatureHeaderName(): string {
  return SIGNATURE_HEADER;
}

/**
 * Parses the X-Recon-Signature header (t=<unix>,v1=<hex>).
 *
 * @param headerValue - Raw header value.
 * @returns Parsed timestamp and v1 signature, or null when malformed.
 */
export function parseWebhookSignatureHeader(
  headerValue: string | null,
): ParsedWebhookSignature | null {
  if (!headerValue?.trim()) {
    return null;
  }

  let timestamp: string | undefined;
  let signatureV1: string | undefined;

  for (const part of headerValue.split(",")) {
    const [key, value] = part.trim().split("=");
    if (key === "t") {
      timestamp = value;
    }
    if (key === "v1") {
      signatureV1 = value;
    }
  }

  if (!timestamp || !signatureV1) {
    return null;
  }

  return { timestamp, signatureV1 };
}

/**
 * Computes the expected v1 HMAC-SHA256 hex digest for a webhook body.
 *
 * @param rawSecret - Tenant webhook signing secret.
 * @param timestamp - Unix seconds string from the signature header.
 * @param rawBody - Exact request body bytes as received.
 * @returns Lowercase hex HMAC digest.
 */
export function computeWebhookSignatureV1(
  rawSecret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac("sha256", rawSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

/**
 * Builds the X-Recon-Signature header value for outbound webhook calls.
 *
 * @param rawSecret - Tenant webhook signing secret.
 * @param rawBody - JSON request body string.
 * @param timestampSec - Optional unix seconds (defaults to now).
 * @returns Header value and timestamp used.
 */
export function buildWebhookSignatureHeader(
  rawSecret: string,
  rawBody: string,
  timestampSec?: number,
): { header: string; timestamp: string } {
  const timestamp = String(timestampSec ?? Math.floor(Date.now() / 1000));
  const signature = computeWebhookSignatureV1(rawSecret, timestamp, rawBody);
  return {
    timestamp,
    header: `t=${timestamp},v1=${signature}`,
  };
}

/**
 * Verifies a webhook signature with constant-time comparison and replay window.
 *
 * @param rawSecret - Tenant webhook signing secret.
 * @param rawBody - Exact request body string.
 * @param headerValue - X-Recon-Signature header value.
 * @param toleranceSec - Max age of timestamp in seconds.
 * @returns True when signature and timestamp are valid.
 */
export function verifyWebhookSignature(
  rawSecret: string,
  rawBody: string,
  headerValue: string | null,
  toleranceSec: number = DEFAULT_TOLERANCE_SEC,
): boolean {
  const parsed = parseWebhookSignatureHeader(headerValue);
  if (!parsed) {
    return false;
  }

  const timestampSec = Number(parsed.timestamp);
  if (!Number.isFinite(timestampSec)) {
    return false;
  }

  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - timestampSec);
  if (ageSec > toleranceSec) {
    return false;
  }

  const expected = computeWebhookSignatureV1(rawSecret, parsed.timestamp, rawBody);
  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(parsed.signatureV1, "utf8");

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, receivedBuf);
}
