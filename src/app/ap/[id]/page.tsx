import { Suspense } from "react";

import { PageLoadingFallback } from "@/app/components/page-loading-fallback";
import { ApInvoiceDetailClient } from "@/app/ap/[id]/ap-invoice-detail-client";

/**
 * AP invoice detail route.
 *
 * @returns Invoice detail with Suspense for search params.
 */
export default function ApInvoiceDetailPage(): React.ReactElement {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <ApInvoiceDetailClient />
    </Suspense>
  );
}
