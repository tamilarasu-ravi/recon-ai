export interface AuditObservability {
  steps?: unknown[];
  llm_skipped?: boolean;
  llm_skipped_reason?: string;
  reason?: string;
  policy_outcome?: string;
  receipt_blocked?: boolean;
  suggested_gl_account_id?: string;
}

/**
 * Safely parses audit observability JSON from the database.
 *
 * @param value - Raw JSON column value.
 * @returns Parsed observability object or empty object when invalid.
 */
export function parseObservability(value: unknown): AuditObservability {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as AuditObservability;
}
