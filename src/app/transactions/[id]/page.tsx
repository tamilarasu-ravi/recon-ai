import { Suspense } from "react";

import { TransactionDetailClient } from "@/app/transactions/[id]/transaction-detail-client";

/**
 * Transaction detail route (Suspense boundary for search params).
 *
 * @returns Transaction page with client detail view.
 */
export default function TransactionDetailPage(): React.ReactElement {
  return (
    <Suspense fallback={<main style={{ padding: "2rem" }}>Loading…</main>}>
      <TransactionDetailClient />
    </Suspense>
  );
}
