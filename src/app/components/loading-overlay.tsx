"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  LOADING_FADE_MS,
  LOADING_MIN_VISIBLE_MS,
} from "@/lib/ui/loading-timing";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/ui/body-scroll-lock";
import { useStableLoading } from "@/lib/ui/use-stable-loading";

interface LoadingOverlayProps {
  /** When true, work is in flight (may not show immediately — see showDelayMs). */
  active: boolean;
  /** When true, dims the viewport and blocks pointer events while visible. */
  blocking?: boolean;
  /** Accessible status message (screen readers only). */
  label?: string;
  /** Skip show delay (e.g. Suspense route fallback). */
  immediate?: boolean;
}

/**
 * Centered full-viewport spinner (portaled to document.body) with stable show/hide timing.
 *
 * @param props - Visibility, blocking mode, label, and timing overrides.
 * @returns Portal overlay or null when not visible.
 */
export function LoadingOverlay({
  active,
  blocking = true,
  label = "Loading",
  immediate = false,
}: LoadingOverlayProps): React.ReactElement | null {
  const [mounted, setMounted] = useState(false);

  const visible = useStableLoading(active, {
    showDelayMs: immediate ? 0 : undefined,
    minVisibleMs: LOADING_MIN_VISIBLE_MS,
  });

  const blockWhileVisible = blocking && visible;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!blockWhileVisible) {
      return undefined;
    }

    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [blockWhileVisible]);

  if (!visible || !mounted) {
    return null;
  }

  return createPortal(
    <div
      className={`loading-overlay loading-overlay--visible${
        blockWhileVisible ? " loading-overlay--blocking" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ transitionDuration: `${LOADING_FADE_MS}ms` }}
    >
      <div className="loading-spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>,
    document.body,
  );
}
