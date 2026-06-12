"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageLayout } from "@/app/components/page-layout";
import {
  PipelineTraceModal,
  type PipelineTraceModalTarget,
} from "@/app/components/pipeline-trace-modal";
import { RetrievalContextPanel } from "@/app/components/retrieval-context-panel";
import { TransactionRunHistory } from "@/app/components/transaction-run-history";
import { DecisionBadge } from "@/app/components/ui/decision-badge";
import { ReasonBadge } from "@/app/components/ui/reason-badge";
import { useTenant } from "@/app/components/tenant-provider";
import { apiFetch } from "@/lib/ui/api-fetch";
import {
  groupTransactionEventsByRun,
} from "@/lib/ui/group-transaction-events";
import { parseRetrievalFromObservability } from "@/lib/ui/parse-retrieval";
import { invalidateReviewQueueCache } from "@/lib/ui/use-review-queue";

interface TransactionDetailResponse {
  transaction: {
    id: string;
    externalTransactionId: string;
    vendorRaw: string;
    memo: string | null;
    amount: string;
    currency: string;
    taggingDecision: string | null;
    confidence: string | null;
    processingStatus: string | null;
    suggested_gl: { glCode: string; glName: string } | null;
    posted_gl: { glCode: string; glName: string } | null;
    erpProvider: string | null;
    erpExternalId: string | null;
    erp_posted_at: string | null;
  };
  review_queue: Array<{ reason: string; status: string; runId: string }>;
  receipt: { clearedAt: string | null; receiptText: string } | null;
  audit_trail: Array<{
    runId: string;
    agent: string;
    decision: string | null;
    confidence: string | null;
    policyVersion: string | null;
    observability: unknown;
    createdAt: string;
  }>;
  events: Array<{ eventType: string; runId: string; payload: unknown; createdAt: string }>;
  pending_auto_tag: { run_id: string; payload: unknown } | null;
  coa_options: Array<{ glCode: string; glName: string }>;
}

/**
 * Formats a chart-of-accounts row for select options and success messages.
 *
 * @param entry - Tenant CoA code and display name.
 * @returns Human-readable label (e.g. "6100 — Software & Cloud").
 */
function formatCoaOptionLabel(entry: { glCode: string; glName: string }): string {
  return `${entry.glCode} — ${entry.glName}`;
}

/**
 * Picks the default override GL from suggestion, posted GL, or first tenant CoA row.
 *
 * @param detail - Loaded transaction detail payload.
 * @returns GL code string or empty when CoA is unavailable.
 */
function resolveDefaultOverrideGlCode(detail: TransactionDetailResponse): string {
  const options = detail.coa_options;
  if (options.length === 0) {
    return "";
  }

  const suggested = detail.transaction.suggested_gl?.glCode;
  if (suggested && options.some((row) => row.glCode === suggested)) {
    return suggested;
  }

  const posted = detail.transaction.posted_gl?.glCode;
  if (posted && options.some((row) => row.glCode === posted)) {
    return posted;
  }

  return options[0]!.glCode;
}

/**
 * Transaction detail with audit trace, LLM skip reason, and override form.
 *
 * @returns Transaction detail view.
 */
export function TransactionDetailClient(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { tenantId: contextTenantId } = useTenant();
  const transactionId = typeof params.id === "string" ? params.id : "";
  const tenantId = searchParams.get("tenant_id") ?? contextTenantId;
  const runIdFromUrl = searchParams.get("run_id");

  const [detail, setDetail] = useState<TransactionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [glCode, setGlCode] = useState("");
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [receiptText, setReceiptText] = useState("Receipt uploaded via UI");
  const [receiptMessage, setReceiptMessage] = useState<string | null>(null);
  const [approveMessage, setApproveMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [traceModalTarget, setTraceModalTarget] = useState<PipelineTraceModalTarget | null>(
    null,
  );
  const [traceModalPending, setTraceModalPending] = useState(false);

  const loadDetail = useCallback(async (): Promise<void> => {
    if (!tenantId || !transactionId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/api/transactions/${transactionId}?tenant_id=${encodeURIComponent(tenantId)}`,
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as TransactionDetailResponse;
      setDetail({
        ...payload,
        coa_options: payload.coa_options ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transaction");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, transactionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!detail) {
      return;
    }
    setGlCode(resolveDefaultOverrideGlCode(detail));
  }, [detail]);

  const eventRuns = useMemo(
    () => (detail ? groupTransactionEventsByRun(detail.events) : []),
    [detail],
  );

  useEffect(() => {
    if (!detail) {
      return;
    }

    const fromUrl =
      runIdFromUrl && detail.events.some((event) => event.runId === runIdFromUrl)
        ? runIdFromUrl
        : null;
    const defaultRun = fromUrl ?? eventRuns[0]?.runId ?? detail.audit_trail[0]?.runId ?? null;
    setSelectedRunId(defaultRun);
  }, [detail, runIdFromUrl, eventRuns]);

  /**
   * Selects an orchestrator run and updates the URL for deep-linking.
   *
   * @param runId - LangGraph run_id to inspect.
   */
  function selectRun(runId: string): void {
    setSelectedRunId(runId);

    const params = new URLSearchParams(searchParams.toString());
    params.set("run_id", runId);
    if (tenantId) {
      params.set("tenant_id", tenantId);
    }
    router.replace(`/transactions/${transactionId}?${params.toString()}`, { scroll: false });
  }

  /**
   * Opens the pipeline trace modal for a run or pending reprocess.
   *
   * @param runId - LangGraph run_id; empty while reprocess is in flight.
   * @param pending - When true, modal shows a spinner until runId is set.
   */
  function openPipelineTraceModal(runId: string, pending: boolean): void {
    if (!detail) {
      return;
    }
    setTraceModalTarget({
      transactionId,
      runId,
      vendorRaw: detail.transaction.vendorRaw,
      externalTransactionId: detail.transaction.externalTransactionId,
    });
    setTraceModalPending(pending);
  }

  /**
   * Closes the pipeline trace modal and clears pending state.
   */
  function closePipelineTraceModal(): void {
    setTraceModalTarget(null);
    setTraceModalPending(false);
  }

  async function submitAutoTagApproval(approved: boolean): Promise<void> {
    if (!tenantId || !detail?.pending_auto_tag) return;
    setApproveMessage(null);
    setActionLoading(true);
    try {
      const response = await apiFetch(`/api/transactions/${transactionId}/approve-auto-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          run_id: detail.pending_auto_tag.run_id,
          approved,
        }),
      });
      const body = (await response.json()) as { error?: string; decision?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      setApproveMessage(
        approved
          ? `Auto-coding approved — status: ${body.decision ?? "unknown"}`
          : "Auto-coding rejected — sent back to review queue",
      );
      invalidateReviewQueueCache(tenantId);
      await loadDetail();
    } catch (err) {
      setApproveMessage(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function runReprocess(): Promise<{
    decision?: string;
    reason?: string;
    confidence?: number;
    run_id?: string;
  }> {
    if (!tenantId) {
      throw new Error("Select a tenant first");
    }
    const response = await apiFetch(
      `/api/transactions/${transactionId}/reprocess?tenant_id=${encodeURIComponent(tenantId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      },
    );
    const body = (await response.json()) as {
      error?: string;
      decision?: string;
      reason?: string;
      confidence?: number;
      run_id?: string;
    };
    if (!response.ok) {
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }
    return body;
  }

  async function submitReprocess(): Promise<void> {
    if (!tenantId || !detail) return;
    setReceiptMessage(null);
    openPipelineTraceModal("", true);
    setActionLoading(true);
    try {
      const body = await runReprocess();
      const reasonLabel = body.reason ? ` (${body.reason})` : "";
      setReceiptMessage(
        `Reprocessed — decision: ${body.decision ?? "unknown"}${reasonLabel}${
          body.confidence !== undefined ? ` · confidence ${body.confidence.toFixed(4)}` : ""
        }`,
      );
      if (body.run_id) {
        setTraceModalTarget({
          transactionId,
          runId: body.run_id,
          vendorRaw: detail.transaction.vendorRaw,
          externalTransactionId: detail.transaction.externalTransactionId,
        });
        setTraceModalPending(false);
        selectRun(body.run_id);
      }
      invalidateReviewQueueCache(tenantId);
      await loadDetail();
    } catch (err) {
      closePipelineTraceModal();
      setReceiptMessage(err instanceof Error ? err.message : "Reprocess failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function submitReceipt(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!tenantId || !detail) return;
    setReceiptMessage(null);
    setActionLoading(true);
    try {
      const response = await apiFetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          transaction_id: transactionId,
          receipt_text: receiptText,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      openPipelineTraceModal("", true);
      setReceiptMessage("Receipt cleared — reprocessing tagging…");

      const reprocessBody = await runReprocess();
      const reasonLabel = reprocessBody.reason ? ` (${reprocessBody.reason})` : "";
      setReceiptMessage(
        `Receipt cleared and reprocessed — decision: ${reprocessBody.decision ?? "unknown"}${reasonLabel}${
          reprocessBody.confidence !== undefined
            ? ` · confidence ${reprocessBody.confidence.toFixed(4)}`
            : ""
        }`,
      );
      if (reprocessBody.run_id) {
        setTraceModalTarget({
          transactionId,
          runId: reprocessBody.run_id,
          vendorRaw: detail.transaction.vendorRaw,
          externalTransactionId: detail.transaction.externalTransactionId,
        });
        setTraceModalPending(false);
        selectRun(reprocessBody.run_id);
      }
      invalidateReviewQueueCache(tenantId);
      await loadDetail();
    } catch (err) {
      closePipelineTraceModal();
      setReceiptMessage(err instanceof Error ? err.message : "Receipt upload failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function submitErpPost(): Promise<void> {
    if (!tenantId) return;
    setActionLoading(true);
    setReceiptMessage(null);
    try {
      const response = await apiFetch("/api/erp/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, transaction_id: transactionId }),
      });
      const body = (await response.json()) as { error?: string; posted?: { externalId: string } };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      setReceiptMessage(`ERP posted — external id: ${body.posted?.externalId ?? "unknown"}`);
      await loadDetail();
    } catch (err) {
      setReceiptMessage(err instanceof Error ? err.message : "ERP post failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function submitOverride(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!tenantId) return;
    setOverrideMessage(null);
    setActionLoading(true);
    try {
      const response = await apiFetch(`/api/transactions/${transactionId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, gl_code: glCode }),
      });
      const body = (await response.json()) as { error?: string; vendorRuleCreated?: boolean };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      const accountLabel =
        detail?.coa_options.find((row) => row.glCode === glCode) ?? null;
      const accountText = accountLabel ? formatCoaOptionLabel(accountLabel) : glCode;
      setOverrideMessage(
        body.vendorRuleCreated
          ? `Override applied — new vendor rule for ${accountText}.`
          : `Override applied — ${accountText} (rule already existed).`,
      );
      invalidateReviewQueueCache(tenantId);
      await loadDetail();
    } catch (err) {
      setOverrideMessage(err instanceof Error ? err.message : "Override failed");
    } finally {
      setActionLoading(false);
    }
  }

  const selectedAudit =
    detail?.audit_trail.find((row) => row.runId === selectedRunId) ?? detail?.audit_trail[0];
  const selectedRetrieval = useMemo(
    () => parseRetrievalFromObservability(selectedAudit?.observability),
    [selectedAudit?.observability],
  );
  const openReview = detail?.review_queue.find((r) => r.status === "open");
  const receiptCleared = Boolean(detail?.receipt?.clearedAt);

  const backHref = tenantId ? `/review-queue` : "/review-queue";

  return (
    <PageLayout
      backHref={backHref}
      backLabel="Review queue"
      loading={loading}
      blocking={loading}
      blockingLabel="Loading transaction…"
    >
      {error ? <p className="alert alert--error">{error}</p> : null}

      {detail ? (
        <>
          <div className="txn-hero">
            <h1 className="txn-hero__vendor">{detail.transaction.vendorRaw}</h1>
            <p className="txn-hero__amount">
              {detail.transaction.amount} {detail.transaction.currency}
              <span style={{ color: "var(--color-text-muted)", marginLeft: "0.5rem" }}>
                · <code>{detail.transaction.externalTransactionId}</code>
              </span>
            </p>
            {detail.transaction.memo ? (
              <p className="txn-hero__memo">Memo: {detail.transaction.memo}</p>
            ) : null}

            <div className="stat-grid">
              <div className="stat">
                <span className="stat__label">Processing</span>
                <span className="stat__value">
                  <span className={`processing-badge processing-badge--${detail.transaction.processingStatus ?? "pending"}`}>
                    {detail.transaction.processingStatus ?? "—"}
                  </span>
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">Decision</span>
                <span className="stat__value">
                  <DecisionBadge decision={detail.transaction.taggingDecision} />
                </span>
              </div>
              <div className="stat">
                <span className="stat__label">Confidence</span>
                <span className="stat__value">{detail.transaction.confidence ?? "—"}</span>
              </div>
              {detail.transaction.suggested_gl ? (
                <div className="stat">
                  <span className="stat__label">Suggested account</span>
                  <span className="stat__value">
                    {detail.transaction.suggested_gl.glCode} — {detail.transaction.suggested_gl.glName}
                  </span>
                </div>
              ) : null}
              {detail.transaction.posted_gl ? (
                <div className="stat">
                  <span className="stat__label">Posted account</span>
                  <span className="stat__value">
                    {detail.transaction.posted_gl.glCode} — {detail.transaction.posted_gl.glName}
                  </span>
                </div>
              ) : null}
            </div>

            {openReview ? (
              <div style={{ marginTop: "1rem" }}>
                <ReasonBadge reason={openReview.reason} />
              </div>
            ) : null}
          </div>

          <section className="panel" style={{ marginBottom: "1.25rem" }}>
            <h2 className="panel__title">ERP sync</h2>
            {detail.transaction.erpExternalId ? (
              <p className="alert alert--success">
                Posted via <strong>{detail.transaction.erpProvider ?? "erp"}</strong> ·{" "}
                <code>{detail.transaction.erpExternalId}</code>
                {detail.transaction.erp_posted_at
                  ? ` · ${new Date(detail.transaction.erp_posted_at).toLocaleString()}`
                  : null}
              </p>
            ) : (
              <p className="panel__desc">
                Auto-coded expenses can be posted to your connected ERP after processing completes.
              </p>
            )}
            {detail.transaction.taggingDecision === "AUTO_TAG" && !detail.transaction.erpExternalId ? (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={loading || actionLoading}
                onClick={() => void submitErpPost()}
              >
                Post to ERP
              </button>
            ) : null}
          </section>

          <TransactionRunHistory
            eventRuns={eventRuns}
            auditTrail={detail.audit_trail}
            selectedRunId={selectedRunId}
            onSelectRun={selectRun}
            onViewPipelineSteps={(runId) => openPipelineTraceModal(runId, false)}
          />

          <RetrievalContextPanel retrieval={selectedRetrieval} tenantId={tenantId} />

          <div className="detail-grid">
            <section className="panel panel--hitl">
              <h2 className="panel__title">Approve auto-coding</h2>
              {detail.pending_auto_tag ? (
                <>
                  <p className="panel__desc">
                    This expense is ready to auto-code but needs your approval before it posts.
                  </p>
                  <div className="btn-group">
                    <button
                      type="button"
                      className="btn btn--success"
                      disabled={loading || actionLoading}
                      onClick={() => void submitAutoTagApproval(true)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={loading || actionLoading}
                      onClick={() => void submitAutoTagApproval(false)}
                    >
                      Send to review
                    </button>
                  </div>
                  {approveMessage ? (
                    <p className="alert alert--info" style={{ marginTop: "0.75rem" }}>
                      {approveMessage}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="panel__desc">No approval is pending for this expense.</p>
              )}
            </section>

            <section className="panel panel--warning">
              <h2 className="panel__title">Receipt</h2>
              <p className="panel__desc">
                Some expenses require a receipt before they can be auto-coded. Upload receipt text
                and we will reprocess automatically.
              </p>
              {receiptCleared ? (
                <p className="alert alert--success" style={{ marginBottom: "1rem" }}>
                  Receipt on file (cleared {new Date(detail.receipt!.clearedAt!).toLocaleString()}).
                </p>
              ) : (
                <p className="alert alert--error" style={{ marginBottom: "1rem" }}>
                  No cleared receipt on file yet.
                </p>
              )}
              <form onSubmit={(e) => void submitReceipt(e)}>
                <textarea
                  className="textarea"
                  value={receiptText}
                  onChange={(e) => setReceiptText(e.target.value)}
                  rows={2}
                  aria-label="Receipt text"
                />
                <div className="btn-group" style={{ marginTop: "0.75rem" }}>
                  <button type="submit" className="btn btn--primary" disabled={loading || actionLoading}>
                    Upload receipt &amp; reprocess
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={loading || actionLoading}
                    onClick={() => void submitReprocess()}
                  >
                    Reprocess only
                  </button>
                </div>
              </form>
              {receiptMessage ? (
                <p className="alert alert--info" style={{ marginTop: "0.75rem" }}>
                  {receiptMessage}
                </p>
              ) : null}
            </section>

            <section className="panel">
              <h2 className="panel__title">Accountant override</h2>
              <p className="panel__desc">
                Choose the correct account for this vendor. Future expenses from the same vendor
                can auto-code using this choice.
              </p>
              <form onSubmit={(e) => void submitOverride(e)} className="form-row">
                <div className="form-field">
                  <label className="form-label" htmlFor="override-gl-account">
                    Account (chart of accounts)
                  </label>
                  {detail.coa_options.length > 0 ? (
                    <select
                      id="override-gl-account"
                      className="select"
                      value={glCode}
                      onChange={(event) => setGlCode(event.target.value)}
                      required
                    >
                      {detail.coa_options.map((option) => (
                        <option key={option.glCode} value={option.glCode}>
                          {formatCoaOptionLabel(option)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="alert alert--error">
                      No accounts are configured for this company. Contact your administrator.
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={loading || actionLoading || !glCode}
                >
                  Apply override
                </button>
              </form>
              {overrideMessage ? (
                <p className="alert alert--success" style={{ marginTop: "0.75rem" }}>
                  {overrideMessage}
                </p>
              ) : null}
            </section>

          </div>

          <PipelineTraceModal
            open={traceModalTarget !== null}
            onClose={closePipelineTraceModal}
            tenantId={tenantId}
            target={traceModalTarget}
            pending={traceModalPending}
            pendingLabel="Running policy and tagging…"
          />
        </>
      ) : null}
    </PageLayout>
  );
}
