/**
 * Encodes a review-queue row position as an opaque pagination cursor.
 *
 * @param createdAt - Row created_at timestamp.
 * @param id - Review queue row UUID.
 * @returns Base64url-encoded cursor string.
 */
export function encodeReviewQueueCursor(createdAt: Date | string, id: string): string {
  const iso =
    createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();
  const payload = JSON.stringify({ c: iso, i: id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

/**
 * Decodes a pagination cursor from the review-queue list API.
 *
 * @param cursor - Opaque cursor from a prior response.
 * @returns Parsed position or null when invalid.
 */
export function decodeReviewQueueCursor(
  cursor: string,
): { createdAt: Date; id: string } | null {
  if (typeof cursor !== "string" || cursor.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      c?: string;
      i?: string;
    };
    if (!parsed.c || !parsed.i) {
      return null;
    }
    const createdAt = new Date(parsed.c);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }
    return { createdAt, id: parsed.i };
  } catch {
    return null;
  }
}
