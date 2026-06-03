"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { DecisionBadge } from "@/app/components/ui/decision-badge";
import { apiFetch } from "@/lib/ui/api-fetch";

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 40;

type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "dead_letter";

interface IngestResponse {
  runId?: string;
  transactionId?: string;
  status?: string;
  processingStatus?: ProcessingStatus;
  decision?: string;
  confidence?: number;
  error?: string;
}

interface StatusPollResponse {
  transaction_id: string;
  processing_status: ProcessingStatus;
  tagging_decision: string | null;
  confidence: number | null;
  ready: boolean;
}

interface DevIngestPanelProps {
  tenantId: string | null;
  disabled?: boolean;
}

/**
 * Dev-only ingest form with async toggle, visible status, and automatic polling.
 *
 * @param props - Current tenant and whether parent actions are in flight.
 * @returns Settings panel for testing sync/async ingest without the browser console.
 */
export function DevIngestPanel({ tenantId, disabled }: DevIngestPanelProps): React.ReactElement {
  const [vendorRaw, setVendorRaw] = useState("STARBUCKS");
  const [amount, setAmount] = useState("42.50");
  const [memo, setMemo] = useState("Dev ingest from Settings UI");
  const [asyncMode, setAsyncMode] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null);
  const [pollStatus, setPollStatus] = useState<StatusPollResponse | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback((): void => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  /**
   * Fetches lightweight processing status for the ingested transaction.
   *
   * @param transactionId - Transaction UUID from ingest response.
   * @returns Parsed status payload or null when the request fails.
   */
  async function fetchStatus(transactionId: string): Promise<StatusPollResponse | null> {
    if (!tenantId) {
      return null;
    }

    const response = await apiFetch(
      `/api/transactions/${transactionId}/status?tenant_id=${encodeURIComponent(tenantId)}`,
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as StatusPollResponse;
  }

  /**
   * Polls until processing completes or attempts are exhausted.
   *
   * @param transactionId - Transaction UUID to watch.
   */
  function startPolling(transactionId: string): void {
    stopPolling();
    setPollCount(0);
    setPollStatus(null);
    setIsPolling(true);

    let attempts = 0;

    const pollOnce = async (): Promise<boolean> => {
      attempts += 1;
      setPollCount(attempts);

      const status = await fetchStatus(transactionId);
      if (status) {
        setPollStatus(status);
      }

      if (status?.ready ?? false) {
        stopPolling();
        setMessage("Tagging finished — open the transaction to see the full audit trace.");
        return true;
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        stopPolling();
        setError("Polling timed out — refresh status or open the transaction manually.");
        return true;
      }

      return false;
    };

    void pollOnce();

    pollTimerRef.current = setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Submits a synthetic transaction through the ingest API.
   */
  async function submitIngest(): Promise<void> {
    if (!tenantId) {
      setError("Select a tenant in the header before ingesting.");
      return;
    }

    stopPolling();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    setHttpStatus(null);
    setIngestResult(null);
    setPollStatus(null);
    setPollCount(0);

    const externalId = `ui-${asyncMode ? "async" : "sync"}-${Date.now()}`;
    const url = asyncMode
      ? "/api/ingest/transactions?async=true"
      : "/api/ingest/transactions";

    try {
      const response = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          external_transaction_id: externalId,
          transaction_timestamp: new Date().toISOString(),
          amount,
          currency: "USD",
          vendor_raw: vendorRaw,
          memo,
        }),
      });

      const body = (await response.json()) as IngestResponse;
      setHttpStatus(response.status);
      setIngestResult(body);

      if (!response.ok) {
        throw new Error(body.error ?? `Ingest failed (HTTP ${response.status})`);
      }

      if (asyncMode && response.status === 202 && body.transactionId) {
        setMessage("Accepted — tagging runs in the background. Status updates below.");
        startPolling(body.transactionId);
        return;
      }

      if (body.transactionId) {
        setMessage(
          asyncMode
            ? "Ingest returned — check HTTP status and processing state below."
            : "Sync ingest complete — decision is available immediately.",
        );
        if (body.transactionId) {
          const status = await fetchStatus(body.transactionId);
          if (status) {
            setPollStatus(status);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setSubmitting(false);
    }
  }

  const transactionId = ingestResult?.transactionId ?? pollStatus?.transaction_id ?? null;
  const detailHref =
    tenantId && transactionId
      ? `/transactions/${transactionId}?tenant_id=${encodeURIComponent(tenantId)}`
      : null;

  const currentProcessingStatus =
    pollStatus?.processing_status ?? ingestResult?.processingStatus ?? null;

  return (
    <section className="panel" style={{ marginBottom: "1.5rem" }}>
      <h2 className="panel__title">Dev ingest (test async workflow)</h2>
      <p className="panel__desc">
        Submit a synthetic transaction here — no browser console needed. Enable{" "}
        <strong>Async mode</strong> to get HTTP 202 and watch{" "}
        <code>pending → processing → completed</code> update live.
      </p>

      {!tenantId ? (
        <p className="alert alert--info">Pick a tenant in the header, then return here.</p>
      ) : null}

      <div className="form-row" style={{ marginBottom: "0.75rem" }}>
        <div className="form-field">
          <label className="form-label" htmlFor="dev-ingest-vendor">
            Vendor
          </label>
          <input
            id="dev-ingest-vendor"
            className="input"
            value={vendorRaw}
            onChange={(e) => setVendorRaw(e.target.value)}
            disabled={disabled || submitting || !tenantId}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="dev-ingest-amount">
            Amount (USD)
          </label>
          <input
            id="dev-ingest-amount"
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={disabled || submitting || !tenantId}
          />
        </div>
      </div>

      <div className="form-field" style={{ marginBottom: "0.75rem" }}>
        <label className="form-label" htmlFor="dev-ingest-memo">
          Memo
        </label>
        <input
          id="dev-ingest-memo"
          className="input"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          disabled={disabled || submitting || !tenantId}
        />
      </div>

      <label className="dev-ingest-toggle">
        <input
          type="checkbox"
          checked={asyncMode}
          onChange={(e) => setAsyncMode(e.target.checked)}
          disabled={disabled || submitting || !tenantId}
        />
        Async mode (<code>?async=true</code> — returns 202 immediately)
      </label>

      <div className="btn-group" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="btn btn--primary"
          disabled={disabled || submitting || !tenantId}
          onClick={() => void submitIngest()}
        >
          {submitting ? "Submitting…" : asyncMode ? "Ingest (async)" : "Ingest (sync)"}
        </button>
        {detailHref ? (
          <Link href={detailHref} className="btn btn--secondary">
            Open transaction
          </Link>
        ) : null}
      </div>

      {error ? <p className="alert alert--error" style={{ marginTop: "1rem" }}>{error}</p> : null}
      {message ? <p className="alert alert--success" style={{ marginTop: "1rem" }}>{message}</p> : null}

      {httpStatus !== null || ingestResult ? (
        <div className="dev-ingest-result" style={{ marginTop: "1.25rem" }}>
          <h3 className="dev-ingest-result__title">Ingest response</h3>
          <ul className="dev-ingest-steps">
            <li className={httpStatus === 202 ? "dev-ingest-steps__item--done" : httpStatus === 201 || httpStatus === 200 ? "dev-ingest-steps__item--done" : ""}>
              HTTP {httpStatus ?? "—"}
              {httpStatus === 202 ? " (accepted, processing queued)" : null}
              {httpStatus === 201 ? " (sync complete)" : null}
            </li>
            {ingestResult?.transactionId ? (
              <li className="dev-ingest-steps__item--done">
                Transaction <code>{ingestResult.transactionId.slice(0, 8)}…</code>
              </li>
            ) : null}
            {ingestResult?.runId ? (
              <li className="dev-ingest-steps__item--done">
                Run <code>{ingestResult.runId.slice(0, 8)}…</code>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {asyncMode && (pollStatus || pollCount > 0 || currentProcessingStatus) ? (
        <div className="dev-ingest-result" style={{ marginTop: "1rem" }}>
          <h3 className="dev-ingest-result__title">
            Processing status
            {isPolling ? " (polling…)" : null}
          </h3>
          <ul className="dev-ingest-steps">
            <li
              className={
                currentProcessingStatus === "pending" ||
                currentProcessingStatus === "processing" ||
                currentProcessingStatus === "completed" ||
                currentProcessingStatus === "failed" ||
                currentProcessingStatus === "dead_letter"
                  ? "dev-ingest-steps__item--done"
                  : ""
              }
            >
              pending
            </li>
            <li
              className={
                currentProcessingStatus === "processing" ||
                currentProcessingStatus === "completed" ||
                currentProcessingStatus === "failed" ||
                currentProcessingStatus === "dead_letter"
                  ? "dev-ingest-steps__item--done"
                  : ""
              }
            >
              processing
            </li>
            <li
              className={
                currentProcessingStatus === "completed"
                  ? "dev-ingest-steps__item--done dev-ingest-steps__item--success"
                  : currentProcessingStatus === "failed"
                    ? "dev-ingest-steps__item--done dev-ingest-steps__item--error"
                    : ""
              }
            >
              {currentProcessingStatus === "failed" || currentProcessingStatus === "dead_letter"
                ? currentProcessingStatus
                : "completed"}
            </li>
          </ul>
          <p style={{ fontSize: "0.875rem", margin: "0.5rem 0 0" }}>
            Current: <strong>{currentProcessingStatus ?? "—"}</strong>
            {pollCount > 0 ? ` · poll #${pollCount}` : null}
          </p>
          {pollStatus?.tagging_decision ? (
            <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
              Decision: <DecisionBadge decision={pollStatus.tagging_decision} />
              {pollStatus.confidence !== null ? (
                <span style={{ marginLeft: "0.5rem" }}>
                  confidence {pollStatus.confidence.toFixed(4)}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
