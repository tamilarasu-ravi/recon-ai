"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ApRunTrace } from "@/app/components/ap-run-trace";
import { PageLayout } from "@/app/components/page-layout";
import { useTenant } from "@/app/components/tenant-provider";
import type { ApInvoiceDetailDto } from "@/lib/data/ap-invoice-list";
import { apiFetch } from "@/lib/ui/api-fetch";

/**
 * AP invoice detail with recommendation metadata, run trace, and related invoices.
 *
 * @returns Invoice detail page.
 */
export function ApInvoiceDetailClient(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const { tenantId: contextTenantId } = useTenant();
  const invoiceId = typeof params.id === "string" ? params.id : "";
  const tenantId = searchParams.get("tenant_id") ?? contextTenantId;
  const runIdFromUrl = searchParams.get("run_id");

  const [invoice, setInvoice] = useState<ApInvoiceDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async (): Promise<void> => {
    if (!tenantId || !invoiceId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(
        `/api/invoices/${invoiceId}?tenant_id=${encodeURIComponent(tenantId)}`,
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { invoice: ApInvoiceDetailDto };
      setInvoice(data.invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, invoiceId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const selectedRunId = useMemo(() => {
    if (!invoice) {
      return null;
    }
    if (runIdFromUrl && invoice.auditTrail.some((row) => row.runId === runIdFromUrl)) {
      return runIdFromUrl;
    }
    return invoice.runId ?? invoice.auditTrail[0]?.runId ?? null;
  }, [invoice, runIdFromUrl]);

  const selectedAudit =
    invoice?.auditTrail.find((row) => row.runId === selectedRunId) ?? invoice?.auditTrail[0];
  const selectedEvents =
    invoice?.domainEvents.filter((event) => event.runId === selectedRunId) ?? [];

  const duplicateInvoiceId = useMemo(() => {
    if (!invoice) {
      return null;
    }
    if (invoice.duplicateOfInvoiceId) {
      return invoice.duplicateOfInvoiceId;
    }
    const related = invoice.relatedInvoices.find(
      (row) => row.externalInvoiceId === invoice.duplicateOfExternalId,
    );
    return related?.id ?? null;
  }, [invoice]);

  /**
   * Scrolls to the AP run trace panel on this page.
   */
  function scrollToRunTrace(): void {
    document.getElementById("ap-run-trace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * Builds a detail URL with tenant_id and optional run_id query params.
   *
   * @param path - Path without query string.
   * @param runId - Optional orchestrator run to deep-link.
   * @returns Path with query string when params are present.
   */
  function detailHref(path: string, runId?: string | null): string {
    const params = new URLSearchParams();
    if (tenantId) {
      params.set("tenant_id", tenantId);
    }
    if (runId) {
      params.set("run_id", runId);
    }
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }

  return (
    <PageLayout
      backHref="/ap"
      backLabel="AP inbox"
      loading={loading}
      blocking={loading}
      blockingLabel="Loading invoice…"
    >
      {error ? <p className="alert alert--error">{error}</p> : null}

      {invoice ? (
        <>
          <section className="panel" style={{ marginBottom: "1rem" }}>
            <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>
              {invoice.vendorRaw}
            </h1>
            <p className="page-subtitle" style={{ marginBottom: "1.25rem" }}>
              {invoice.amount} {invoice.currency} ·{" "}
              <Link
                href={
                  invoice.relatedInvoices.length > 0 ? "#vendor-invoices" : detailHref("/ap")
                }
                className="inline-link"
                title={
                  invoice.relatedInvoices.length > 0
                    ? "Jump to same-vendor invoices"
                    : "View in AP inbox"
                }
              >
                <code>{invoice.externalInvoiceId}</code>
              </Link>
            </p>

            <div className="stat-grid">
              <div className="stat">
                <span className="stat__label">Invoice date</span>
                <span className="stat__value">{new Date(invoice.invoiceDate).toLocaleString()}</span>
              </div>
              <div className="stat">
                <span className="stat__label">Pay date</span>
                <span className="stat__value">
                  {invoice.recommendedPayDate
                    ? new Date(invoice.recommendedPayDate).toLocaleDateString()
                    : "—"}
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">Funding</span>
                <span className="stat__value">{invoice.fundingSource ?? "—"}</span>
              </div>
            </div>

            {invoice.recommendationRationale ? (
              <p className="alert alert--info" style={{ marginTop: "1rem" }}>
                {invoice.recommendationRationale}
              </p>
            ) : null}

            {invoice.runId ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "1rem" }}>
                run_id:{" "}
                <button type="button" className="inline-link-button" onClick={scrollToRunTrace}>
                  <code>{invoice.runId}</code>
                </button>
                {" · "}
                <Link
                  href={`/orchestrator?workflow=ap&run_id=${encodeURIComponent(invoice.runId)}`}
                  className="inline-link"
                >
                  AP graph topology
                </Link>
              </p>
            ) : null}

            {invoice.duplicateOfExternalId ? (
              <p className="alert alert--warning" style={{ marginTop: "0.75rem" }}>
                Marked duplicate of{" "}
                {duplicateInvoiceId ? (
                  <Link href={detailHref(`/ap/${duplicateInvoiceId}`)} className="inline-link">
                    <code>{invoice.duplicateOfExternalId}</code>
                  </Link>
                ) : (
                  <code>{invoice.duplicateOfExternalId}</code>
                )}
              </p>
            ) : null}
          </section>

          {invoice.relatedInvoices.length > 0 ? (
            <section id="vendor-invoices" className="panel panel--muted" style={{ marginBottom: "1rem" }}>
              <h2 className="panel__title">Same vendor (AP history)</h2>
              <p className="panel__desc">
                Other invoices for <strong>{invoice.vendorRaw}</strong> on this tenant.
              </p>
              <ul className="api-list">
                {invoice.relatedInvoices.map((related) => (
                  <li key={related.id}>
                    <Link
                      href={detailHref(`/ap/${related.id}`)}
                      className="inline-link"
                      style={{ fontWeight: 600 }}
                    >
                      <code>{related.externalInvoiceId}</code>
                    </Link>
                    {" · "}
                    {related.amount} · {new Date(related.invoiceDate).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section id="ap-run-trace" className="panel panel--muted">
            <h2 className="panel__title">AP run trace</h2>
            <p className="panel__desc">
              LangGraph steps for this recommendation run (duplicate check → ingest → recommend).
            </p>
            <ApRunTrace audit={selectedAudit ?? null} events={selectedEvents} />
          </section>
        </>
      ) : null}
    </PageLayout>
  );
}
