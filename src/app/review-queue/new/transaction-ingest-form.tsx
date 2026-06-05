"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DecisionBadge } from "@/app/components/ui/decision-badge";
import { useTenant } from "@/app/components/tenant-provider";
import { apiFetch } from "@/lib/ui/api-fetch";
import {
  buildExternalTransactionId,
  CURRENCY_OPTIONS,
  CUSTOM_VENDOR_SELECT_VALUE,
  formatDatetimeLocalValue,
  getPresetsForTenant,
  getVendorOptionsForTenant,
  MCC_OPTIONS,
  resolveVendorSelectValue,
  type TransactionIngestPreset,
} from "@/lib/ui/transaction-ingest-presets";

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

/**
 * Full transaction ingest form for adding items that flow into the review queue.
 *
 * @returns Form with tenant-scoped presets, validation-friendly fields, and status polling.
 */
export function TransactionIngestForm(): React.ReactElement {
  const { tenants, tenantId, loading: tenantLoading } = useTenant();

  const activeTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === tenantId) ?? null,
    [tenants, tenantId],
  );

  const presets = useMemo(
    () => getPresetsForTenant(activeTenant?.slug),
    [activeTenant?.slug],
  );

  const vendorOptions = useMemo(
    () => getVendorOptionsForTenant(activeTenant?.slug),
    [activeTenant?.slug],
  );

  const defaultPreset = presets[0];

  const [presetId, setPresetId] = useState(defaultPreset.id);
  const [vendorSelect, setVendorSelect] = useState(
    resolveVendorSelectValue(defaultPreset.values.vendorRaw, vendorOptions),
  );
  const [vendorCustom, setVendorCustom] = useState(defaultPreset.values.vendorRaw);
  const [amount, setAmount] = useState(defaultPreset.values.amount);
  const [currency, setCurrency] = useState(defaultPreset.values.currency);
  const [transactionAt, setTransactionAt] = useState(formatDatetimeLocalValue(new Date()));
  const [externalId, setExternalId] = useState(buildExternalTransactionId(true));
  const [memo, setMemo] = useState(defaultPreset.values.memo);
  const [mcc, setMcc] = useState(defaultPreset.values.mcc);
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

  const activePreset = presets.find((preset) => preset.id === presetId) ?? presets[0];

  const vendorRaw =
    vendorSelect === CUSTOM_VENDOR_SELECT_VALUE ? vendorCustom.trim() : vendorSelect;

  const formDisabled = tenantLoading || submitting || !tenantId;

  /**
   * Applies a scenario preset to all form fields.
   *
   * @param preset - Preset definition from tenant seed alignment.
   */
  const applyPreset = useCallback(
    (preset: TransactionIngestPreset): void => {
      setPresetId(preset.id);
      setVendorSelect(resolveVendorSelectValue(preset.values.vendorRaw, vendorOptions));
      setVendorCustom(preset.values.vendorRaw);
      setAmount(preset.values.amount);
      setCurrency(preset.values.currency);
      setMemo(preset.values.memo);
      setMcc(preset.values.mcc);
      setExternalId(buildExternalTransactionId(asyncMode));
      setTransactionAt(formatDatetimeLocalValue(new Date()));
    },
    [asyncMode, vendorOptions],
  );

  useEffect(() => {
    if (presets.length === 0) {
      return;
    }
    const stillValid = presets.some((preset) => preset.id === presetId);
    if (!stillValid) {
      applyPreset(presets[0]);
    }
  }, [presets, presetId, applyPreset]);

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
        setMessage("Tagging finished — open the transaction or refresh the review queue.");
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
   * Submits the form through POST /api/ingest/transactions for the active tenant.
   */
  async function submitIngest(): Promise<void> {
    if (!tenantId) {
      setError("Select a tenant in the header before submitting.");
      return;
    }

    if (!vendorRaw) {
      setError("Vendor is required.");
      return;
    }

    const parsedDate = new Date(transactionAt);
    if (Number.isNaN(parsedDate.getTime())) {
      setError("Transaction date is invalid.");
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

    const url = asyncMode
      ? "/api/ingest/transactions?async=true"
      : "/api/ingest/transactions";

    const body: Record<string, string> = {
      tenant_id: tenantId,
      external_transaction_id: externalId.trim(),
      transaction_timestamp: parsedDate.toISOString(),
      amount,
      currency,
      vendor_raw: vendorRaw,
      memo,
    };

    if (mcc.trim()) {
      body.mcc = mcc.trim();
    }

    try {
      const response = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const responseBody = (await response.json()) as IngestResponse;
      setHttpStatus(response.status);
      setIngestResult(responseBody);

      if (!response.ok) {
        throw new Error(responseBody.error ?? `Ingest failed (HTTP ${response.status})`);
      }

      if (asyncMode && response.status === 202 && responseBody.transactionId) {
        setMessage("Accepted — tagging runs in the background. Status updates below.");
        startPolling(responseBody.transactionId);
        return;
      }

      if (responseBody.transactionId) {
        setMessage("Ingest complete — check decision below or open the review queue.");
        const status = await fetchStatus(responseBody.transactionId);
        if (status) {
          setPollStatus(status);
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
    <div className="ingest-form">
      {!tenantId && !tenantLoading ? (
        <p className="alert alert--info">Pick a tenant in the header, then return here.</p>
      ) : null}

      {activeTenant ? (
        <p className="ingest-form__tenant" style={{ fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          Submitting for <strong>{activeTenant.name}</strong>{" "}
          <span style={{ color: "var(--color-text-muted)" }}>({activeTenant.slug})</span>
        </p>
      ) : null}

      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel__title">Scenario preset</h2>
        <p className="panel__desc">
          Choose a seeded example to prefill valid values. You can edit any field before submit.
        </p>

        <div className="form-field" style={{ marginBottom: "0.75rem" }}>
          <label className="form-label" htmlFor="ingest-preset">
            Preset
          </label>
          <select
            id="ingest-preset"
            className="select"
            style={{ minWidth: "min(100%, 28rem)" }}
            value={presetId}
            onChange={(event) => {
              const next = presets.find((preset) => preset.id === event.target.value);
              if (next) {
                applyPreset(next);
              }
            }}
            disabled={formDisabled}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", margin: 0 }}>
          {activePreset.description}
        </p>
        <p
          className="alert alert--info"
          style={{ marginTop: "0.75rem", marginBottom: 0, fontSize: "0.8125rem" }}
        >
          Expected: {activePreset.expectedOutcome}
        </p>
      </section>

      <section className="panel">
        <h2 className="panel__title">Transaction details</h2>

        <div className="form-row" style={{ marginBottom: "0.75rem" }}>
          <div className="form-field" style={{ flex: "1 1 14rem" }}>
            <label className="form-label" htmlFor="ingest-vendor">
              Vendor
            </label>
            <select
              id="ingest-vendor"
              className="select"
              value={vendorSelect}
              onChange={(event) => setVendorSelect(event.target.value)}
              disabled={formDisabled}
            >
              {vendorOptions.map((vendor) => (
                <option key={vendor} value={vendor}>
                  {vendor}
                </option>
              ))}
              <option value={CUSTOM_VENDOR_SELECT_VALUE}>Custom vendor…</option>
            </select>
          </div>

          {vendorSelect === CUSTOM_VENDOR_SELECT_VALUE ? (
            <div className="form-field" style={{ flex: "1 1 14rem" }}>
              <label className="form-label" htmlFor="ingest-vendor-custom">
                Custom vendor name
              </label>
              <input
                id="ingest-vendor-custom"
                className="input"
                value={vendorCustom}
                onChange={(event) => setVendorCustom(event.target.value)}
                disabled={formDisabled}
                placeholder="e.g. Mystery Wholesale LLC"
              />
            </div>
          ) : null}
        </div>

        <div className="form-row" style={{ marginBottom: "0.75rem" }}>
          <div className="form-field" style={{ flex: "0 1 8rem" }}>
            <label className="form-label" htmlFor="ingest-amount">
              Amount
            </label>
            <input
              id="ingest-amount"
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={formDisabled}
              placeholder="99.00"
            />
          </div>

          <div className="form-field" style={{ flex: "0 1 6rem" }}>
            <label className="form-label" htmlFor="ingest-currency">
              Currency
            </label>
            <select
              id="ingest-currency"
              className="select"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              disabled={formDisabled}
            >
              {CURRENCY_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field" style={{ flex: "1 1 14rem" }}>
            <label className="form-label" htmlFor="ingest-mcc">
              MCC (optional)
            </label>
            <select
              id="ingest-mcc"
              className="select"
              value={mcc}
              onChange={(event) => setMcc(event.target.value)}
              disabled={formDisabled}
            >
              {MCC_OPTIONS.map((option) => (
                <option key={option.value || "none"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: "0.75rem" }}>
          <div className="form-field" style={{ flex: "1 1 16rem" }}>
            <label className="form-label" htmlFor="ingest-timestamp">
              Transaction date &amp; time
            </label>
            <input
              id="ingest-timestamp"
              className="input"
              type="datetime-local"
              value={transactionAt}
              onChange={(event) => setTransactionAt(event.target.value)}
              disabled={formDisabled}
            />
          </div>

          <div className="form-field" style={{ flex: "1 1 16rem" }}>
            <label className="form-label" htmlFor="ingest-external-id">
              External transaction ID
            </label>
            <input
              id="ingest-external-id"
              className="input"
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              disabled={formDisabled}
              maxLength={128}
            />
          </div>
        </div>

        <div className="form-field" style={{ marginBottom: "0.75rem" }}>
          <label className="form-label" htmlFor="ingest-memo">
            Memo
          </label>
          <textarea
            id="ingest-memo"
            className="textarea"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            disabled={formDisabled}
            maxLength={512}
          />
        </div>

        <fieldset style={{ border: "none", padding: 0, margin: "0 0 1rem" }}>
          <legend className="form-label" style={{ marginBottom: "0.5rem" }}>
            Processing mode
          </legend>
          <label className="dev-ingest-toggle" style={{ marginRight: "1.25rem" }}>
            <input
              type="radio"
              name="ingest-mode"
              checked={asyncMode}
              onChange={() => {
                setAsyncMode(true);
                setExternalId(buildExternalTransactionId(true));
              }}
              disabled={formDisabled}
            />
            Async (202 — background tagging)
          </label>
          <label className="dev-ingest-toggle">
            <input
              type="radio"
              name="ingest-mode"
              checked={!asyncMode}
              onChange={() => {
                setAsyncMode(false);
                setExternalId(buildExternalTransactionId(false));
              }}
              disabled={formDisabled}
            />
            Sync (wait for decision)
          </label>
        </fieldset>

        <div className="btn-group">
          <button
            type="button"
            className="btn btn--primary"
            disabled={formDisabled}
            onClick={() => void submitIngest()}
          >
            {submitting ? "Submitting…" : "Submit transaction"}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={formDisabled}
            onClick={() => setExternalId(buildExternalTransactionId(asyncMode))}
          >
            New external ID
          </button>
          {detailHref ? (
            <Link href={detailHref} className="btn btn--secondary">
              Open transaction
            </Link>
          ) : null}
          <Link href="/review-queue" className="btn btn--secondary">
            Back to queue
          </Link>
        </div>

        {error ? (
          <p className="alert alert--error" style={{ marginTop: "1rem" }}>
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="alert alert--success" style={{ marginTop: "1rem" }}>
            {message}
          </p>
        ) : null}

        {httpStatus !== null || ingestResult ? (
          <div className="dev-ingest-result" style={{ marginTop: "1.25rem" }}>
            <h3 className="dev-ingest-result__title">Ingest response</h3>
            <ul className="dev-ingest-steps">
              <li
                className={
                  httpStatus === 202 || httpStatus === 201 || httpStatus === 200
                    ? "dev-ingest-steps__item--done"
                    : ""
                }
              >
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

        {(asyncMode || pollStatus) &&
        (pollStatus || pollCount > 0 || currentProcessingStatus) ? (
          <div className="dev-ingest-result" style={{ marginTop: "1rem" }}>
            <h3 className="dev-ingest-result__title">
              Processing status
              {isPolling ? " (polling…)" : ""}
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
                {currentProcessingStatus === "failed" ||
                currentProcessingStatus === "dead_letter"
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
                {pollStatus.tagging_decision === "QUEUE_REVIEW" ||
                pollStatus.tagging_decision === "REFUSE" ? (
                  <span style={{ marginLeft: "0.5rem" }}>
                    —{" "}
                    <Link href="/review-queue" className="nav-link" style={{ fontSize: "inherit" }}>
                      view review queue
                    </Link>
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
