import { LoadingOverlay } from "@/app/components/loading-overlay";

/**
 * Suspense fallback with the standard page chrome and centered spinner.
 *
 * @returns Minimal loading shell for client-heavy routes.
 */
export function PageLoadingFallback(): React.ReactElement {
  return (
    <main className="app-main" aria-busy="true">
      <LoadingOverlay active blocking immediate label="Loading page…" />
    </main>
  );
}
