"use client";

import { PageLayout } from "@/app/components/page-layout";
import { useTenant } from "@/app/components/tenant-provider";

import { TransactionIngestForm } from "./transaction-ingest-form";

/**
 * New transaction ingest page — submits a synthetic txn for the selected tenant.
 *
 * @returns Page with prefilled, tenant-aware ingest form.
 */
export default function NewReviewQueueTransactionPage(): React.ReactElement {
  const { loading: tenantLoading } = useTenant();

  return (
    <PageLayout
      title="Add transaction"
      subtitle="Ingest a card transaction for the selected tenant. Tagging runs through policy and may land in the review queue."
      backHref="/review-queue"
      backLabel="Review queue"
      loading={tenantLoading}
      blocking={tenantLoading}
      blockingLabel="Loading tenant…"
    >
      <TransactionIngestForm />
    </PageLayout>
  );
}
