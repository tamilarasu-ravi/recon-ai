import { LoadingOverlay } from "@/app/components/loading-overlay";

interface LoadingBarProps {
  /** When true, shows the centered spinner. */
  active: boolean;
  /** @deprecated Variant ignored; spinner is always centered on the viewport. */
  variant?: "fixed" | "inline";
}

/**
 * Centered loading spinner (replaces the former top progress strip).
 *
 * @param props - Visibility flag.
 * @returns Centered spinner overlay or null when inactive.
 */
export function LoadingBar({ active }: LoadingBarProps): React.ReactElement | null {
  return <LoadingOverlay active={active} blocking={false} label="Loading" />;
}
