"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/ui/api-fetch";
import {
  BULK_INGEST_MAX_ROWS,
  parseBulkTransactionsCsv,
} from "@/lib/ingest/bulk-transaction-schema";

const SAMPLE_CSV = `external_transaction_id,transaction_timestamp,amount,currency,vendor_raw,memo,mcc
bulk-demo-001,2026-06-02T10:00:00Z,120.00,USD,AMAZON,Office supplies,
bulk-demo-002,2026-06-02T11:00:00Z,45.50,USD,UBER,Client visit,`;

interface BulkImportPanelProps {
  tenantId: string | null;
  disabled?: boolean;
}

interface BulkIngestResponse {
  accepted: number;
  duplicates: number;
  failed: number;
  async: boolean;
  results: Array<{
    externalTransactionId: string;
    status: string;
    error?: string;
  }>;
}

/**
 * CSV bulk import for up to 50 transactions (async queue by default).
 *
 * @param props - Tenant id and parent loading flag.
 * @returns Settings panel for bulk ingest testing.
 */
export function BulkImportPanel({ tenantId, disabled }: BulkImportPanelProps): React.ReactElement {
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [asyncMode, setAsyncMode] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BulkIngestResponse | null>(null);

  async function submitBulk(): Promise<void> {
    if (!tenantId) {
      setError("Select a tenant in the header first.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSummary(null);

    try {
      const transactions = parseBulkTransactionsCsv(csvText);

      const response = await apiFetch("/api/ingest/transactions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          transactions,
          async: asyncMode,
        }),
      });

      const body = (await response.json()) as BulkIngestResponse & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      setSummary(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk import failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel panel--muted" style={{ marginBottom: "1.5rem" }}>
      <h2 className="panel__title">Bulk CSV import</h2>
      <p className="panel__desc">
        Paste up to {BULK_INGEST_MAX_ROWS} rows. Required columns:{" "}
        <code>external_transaction_id</code>, <code>transaction_timestamp</code>,{" "}
        <code>amount</code>, <code>vendor_raw</code>. Uses the same async queue as single
        ingest.
      </p>

      <textarea
        className="input"
        rows={8}
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        disabled={disabled || submitting || !tenantId}
        aria-label="CSV content"
        style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}
      />

      <label className="dev-ingest-toggle" style={{ marginTop: "0.75rem" }}>
        <input
          type="checkbox"
          checked={asyncMode}
          onChange={(e) => setAsyncMode(e.target.checked)}
          disabled={disabled || submitting || !tenantId}
        />
        Async queue (202 — process in background)
      </label>

      <div className="btn-group" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="btn btn--primary"
          disabled={disabled || submitting || !tenantId}
          onClick={() => void submitBulk()}
        >
          {submitting ? "Importing…" : "Import CSV"}
        </button>
      </div>

      {error ? <p className="alert alert--error" style={{ marginTop: "1rem" }}>{error}</p> : null}

      {summary ? (
        <p className="alert alert--success" style={{ marginTop: "1rem" }}>
          Accepted {summary.accepted}, duplicates {summary.duplicates}, failed {summary.failed}
          {summary.async ? " (async)" : " (sync)"}.
        </p>
      ) : null}
    </section>
  );
}
