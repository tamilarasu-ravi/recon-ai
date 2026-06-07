import { Suspense } from "react";

import { PageLoadingFallback } from "@/app/components/page-loading-fallback";
import { SettingsClient } from "@/app/settings/settings-client";

/**
 * Settings route — API keys and integrations.
 *
 * @returns Settings page with Suspense for search params.
 */
export default function SettingsPage(): React.ReactElement {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <SettingsClient />
    </Suspense>
  );
}
