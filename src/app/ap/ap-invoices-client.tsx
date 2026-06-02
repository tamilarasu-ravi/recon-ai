"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageLayout } from "@/app/components/page-layout";
import { useTenant } from "@/app/components/tenant-provider";
import type { ApInvoiceListItemDto } from "@/lib/data/ap-invoice-list";
import { apiFetch } from "@/lib/ui/api-fetch";

/**
 * AP inbox — lists invoices and recommendations for the selected tenant.
 *
 * @returns AP invoices page.
 */
export function ApInvoicesClient(): React.ReactElement {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [items, setItems] = useState<ApInvoiceListItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInvoices = useCallback(async (): Promise<void> => {
    if (!tenantId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/invoices?tenant_id=${encodeURIComponent(tenantId)}`);
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { items: ApInvoiceListItemDto[] };
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading && tenantId) {
      void loadInvoices();
    }
  }, [tenantLoading, tenantId, loadInvoices]);

  return (
    <PageLayout
      title="AP inbox"
      subtitle="Recommend-only payables — duplicate detection and funding suggestions (no payment execution)."
      loading={loading}
      blocking={loading}
      blockingLabel="Loading invoices…"
    >
      <div style={{ marginBottom: "1rem" }}>
        <button type="button" className="btn btn--secondary" onClick={() => void loadInvoices()}>
          Refresh
        </button>
      </div>

      {error ? <p className="alert alert--error">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="empty-state">No invoices — run db:seed or POST /api/ingest/invoices.</div>
      ) : null}

      <ul className="queue-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/ap/${item.id}?tenant_id=${encodeURIComponent(tenantId ?? "")}`}
              className="queue-item queue-item--clickable"
            >
              <div className="queue-item__header">
                <span className="queue-item__vendor">{item.vendorRaw}</span>
                <span className="queue-item__amount">
                  {item.amount} {item.currency}
                </span>
                <span className={`badge ${item.hasRecommendation ? "badge--auto" : "badge--review"}`}>
                  {item.hasRecommendation ? "Recommended" : "No recommendation"}
                </span>
              </div>
              <p className="queue-item__meta">
                <code>{item.externalInvoiceId}</code> · due{" "}
                {new Date(item.invoiceDate).toLocaleDateString()}
                {item.fundingSource ? ` · ${item.fundingSource}` : ""}
              </p>
              {item.recommendationRationale ? (
                <p className="queue-item__meta" style={{ marginTop: 0 }}>
                  {item.recommendationRationale}
                </p>
              ) : null}
              <span className="queue-item__footer">View invoice &amp; run trace →</span>
            </Link>
          </li>
        ))}
      </ul>
    </PageLayout>
  );
}
