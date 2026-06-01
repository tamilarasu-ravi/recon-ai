/** GL codes that must never AUTO_TAG (human review required per policy). */
const REVIEW_ONLY_GL_CODES = new Set(["6300"]);

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(the\s+)?(above|system)/i,
  /set\s+gl\s+to\s+\d+/i,
  /9999-invalid/i,
];

/**
 * Detects likely prompt-injection attempts in transaction memo text.
 *
 * @param memo - Optional transaction memo from source feed.
 * @returns True when memo matches a known injection pattern.
 */
export function hasPromptInjectionSignal(memo?: string): boolean {
  if (!memo?.trim()) {
    return false;
  }
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(memo));
}

/**
 * Returns whether a GL code is restricted to human review (no AUTO_TAG).
 *
 * @param glCode - Chart of accounts code string.
 * @returns True when auto-tag must be blocked for this GL.
 */
export function isReviewOnlyGlCode(glCode: string): boolean {
  return REVIEW_ONLY_GL_CODES.has(glCode);
}
