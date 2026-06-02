import { Suspense } from "react";

import { PageLoadingFallback } from "@/app/components/page-loading-fallback";
import { TransactionDetailClient } from "@/app/transactions/[id]/transaction-detail-client";

/**
 * Transaction detail route (Suspense boundary for search params).
 *
 * @returns Transaction page with client detail view.
 */
export default function TransactionDetailPage(): React.ReactElement {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <TransactionDetailClient />
    </Suspense>
  );
}
