import { Suspense } from "react";

import { PageLoadingFallback } from "@/app/components/page-loading-fallback";
import { OrchestratorClient } from "@/app/orchestrator/orchestrator-client";

/**
 * LangGraph orchestrator topology showcase page.
 *
 * @returns Orchestrator page with workflow diagrams.
 */
export default function OrchestratorPage(): React.ReactElement {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <OrchestratorClient />
    </Suspense>
  );
}
