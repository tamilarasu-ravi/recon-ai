/** Nested blocking overlays each call lock/unlock; body scroll restores only when count hits zero. */
let scrollLockCount = 0;

const BODY_LOCK_CLASS = "body-scroll-locked";

/**
 * Prevents document scrolling while a blocking overlay is visible.
 */
export function lockBodyScroll(): void {
  scrollLockCount += 1;
  if (typeof document !== "undefined") {
    document.body.classList.add(BODY_LOCK_CLASS);
  }
}

/**
 * Releases one body scroll lock from {@link lockBodyScroll}.
 */
export function unlockBodyScroll(): void {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0 && typeof document !== "undefined") {
    document.body.classList.remove(BODY_LOCK_CLASS);
  }
}
