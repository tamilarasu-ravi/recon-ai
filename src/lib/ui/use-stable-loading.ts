"use client";

import { useEffect, useRef, useState } from "react";

import {
  LOADING_MIN_VISIBLE_MS,
  LOADING_SHOW_DELAY_MS,
  computeLoadingHideDelayMs,
} from "@/lib/ui/loading-timing";

export interface StableLoadingOptions {
  /** Ms to wait before showing (0 = immediate). */
  showDelayMs?: number;
  /** Ms to keep visible after work completes. */
  minVisibleMs?: number;
}

/**
 * Debounces loading UI: delayed show, minimum visible duration, cancel-safe timers.
 *
 * @param active - Raw in-flight flag from data hooks or actions.
 * @param options - Optional timing overrides.
 * @returns Whether the loading indicator should be rendered.
 */
export function useStableLoading(
  active: boolean,
  options?: StableLoadingOptions,
): boolean {
  const showDelayMs = options?.showDelayMs ?? LOADING_SHOW_DELAY_MS;
  const minVisibleMs = options?.minVisibleMs ?? LOADING_MIN_VISIBLE_MS;

  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const clearShowTimer = (): void => {
      if (showTimerRef.current !== null) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const clearHideTimer = (): void => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    if (active) {
      clearHideTimer();

      if (visible) {
        return undefined;
      }

      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        visibleSinceRef.current = Date.now();
        setVisible(true);
      }, showDelayMs);

      return clearShowTimer;
    }

    clearShowTimer();

    if (!visible) {
      return undefined;
    }

    const hideDelayMs = computeLoadingHideDelayMs(
      visibleSinceRef.current,
      Date.now(),
      minVisibleMs,
    );

    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      visibleSinceRef.current = null;
      setVisible(false);
    }, hideDelayMs);

    return clearHideTimer;
  }, [active, visible, showDelayMs, minVisibleMs]);

  return visible;
}
