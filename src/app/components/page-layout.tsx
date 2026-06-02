import Link from "next/link";
import type { ReactNode } from "react";

import { LoadingOverlay } from "@/app/components/loading-overlay";

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  /** Shows a centered spinner while data is fetching (non-blocking if `blocking` is false). */
  loading?: boolean;
  /**
   * Covers the page and blocks clicks during API calls.
   * Defaults to `loading` when omitted.
   */
  blocking?: boolean;
  /** Status text on the blocking overlay. */
  blockingLabel?: string;
}

/**
 * Standard page wrapper with optional header and back navigation.
 *
 * @param props - Page content and optional metadata.
 * @returns Constrained main layout region.
 */
export function PageLayout({
  children,
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  loading = false,
  blocking,
  blockingLabel = "Working…",
}: PageLayoutProps): React.ReactElement {
  const isBlocking = blocking ?? loading;

  return (
    <main className="app-main" aria-busy={loading || isBlocking}>
      <LoadingOverlay
        active={loading || isBlocking}
        blocking={isBlocking}
        label={blockingLabel}
      />
      {backHref ? (
        <Link href={backHref} className="back-link">
          ← {backLabel}
        </Link>
      ) : null}
      {title ? (
        <header className="page-header">
          <h1 className="page-title">{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </main>
  );
}
