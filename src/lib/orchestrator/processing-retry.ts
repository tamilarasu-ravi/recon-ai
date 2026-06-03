/** Default max attempts before a transaction is moved to dead_letter. */
export const DEFAULT_MAX_PROCESSING_ATTEMPTS = 3;

/** Base delay before the first retry (milliseconds). */
export const PROCESSING_RETRY_BASE_DELAY_MS = 30_000;

/** Multiplier applied per failed attempt for exponential backoff. */
export const PROCESSING_RETRY_BACKOFF_MULTIPLIER = 4;

/** Transactions stuck in processing longer than this are eligible for reclaim. */
export const PROCESSING_STALE_MS = 15 * 60 * 1000;

export type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "dead_letter";

/**
 * Returns true when processing has reached a terminal state for polling clients.
 *
 * @param status - Current processing_status value.
 * @returns Whether no further automatic processing is expected.
 */
export function isTerminalProcessingStatus(status: ProcessingStatus): boolean {
  return status === "completed" || status === "failed" || status === "dead_letter";
}

/**
 * Reads max processing attempts from environment with a safe default.
 *
 * @returns Positive integer cap for automatic retries.
 */
export function getMaxProcessingAttempts(): number {
  const raw = process.env.PROCESSING_MAX_ATTEMPTS?.trim();
  if (!raw) {
    return DEFAULT_MAX_PROCESSING_ATTEMPTS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MAX_PROCESSING_ATTEMPTS;
  }
  return parsed;
}

/**
 * Computes exponential backoff delay after a failed attempt.
 *
 * @param attemptCount - Number of attempts already recorded (1-based after failure).
 * @returns Delay in milliseconds before the next retry.
 */
export function computeProcessingRetryDelayMs(attemptCount: number): number {
  const exponent = Math.max(0, attemptCount - 1);
  return PROCESSING_RETRY_BASE_DELAY_MS * PROCESSING_RETRY_BACKOFF_MULTIPLIER ** exponent;
}

/**
 * Derives the next retry timestamp from the current attempt count.
 *
 * @param attemptCount - Attempts recorded after a failure.
 * @returns Date when the worker may pick up the transaction again.
 */
export function computeNextRetryAt(attemptCount: number): Date {
  return new Date(Date.now() + computeProcessingRetryDelayMs(attemptCount));
}
