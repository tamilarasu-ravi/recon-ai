/** Wait before showing spinner so sub-threshold requests never flash. */
export const LOADING_SHOW_DELAY_MS = 280;

/** Keep spinner visible at least this long once shown (avoids blink). */
export const LOADING_MIN_VISIBLE_MS = 520;

/** Opacity transition length — should be less than min visible. */
export const LOADING_FADE_MS = 200;

/**
 * Computes how long to wait before hiding the loader after work completes.
 *
 * @param visibleSinceMs - Timestamp when the loader became visible, or null.
 * @param nowMs - Current time (ms).
 * @param minVisibleMs - Minimum time the loader should stay on screen.
 * @returns Delay in ms before hiding.
 */
export function computeLoadingHideDelayMs(
  visibleSinceMs: number | null,
  nowMs: number,
  minVisibleMs: number,
): number {
  const elapsed =
    visibleSinceMs !== null ? nowMs - visibleSinceMs : minVisibleMs;
  return Math.max(0, minVisibleMs - elapsed);
}
