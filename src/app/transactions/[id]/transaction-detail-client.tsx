"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageLayout } from "@/app/components/page-layout";
import { RetrievalContextPanel } from "@/app/components/retrieval-context-panel";
import { TransactionRunTrace } from "@/app/components/transaction-run-trace";
import { DecisionBadge } from "@/app/components/ui/decision-badge";
import { ReasonBadge } from "@/app/components/ui/reason-badge";
import { useTenant } from "@/app/components/tenant-provider";
import { apiFetch } from "@/lib/ui/api-fetch";
import {
  formatEventRunLabel,
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
  const [glCode, setGlCode] = useState("6200");
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [receiptText, setReceiptText] = useState("Receipt uploaded via UI");
  const [receiptMessage, setReceiptMessage] = useState<string | null>(null);
  const [approveMessage, setApproveMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

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
      setDetail((await response.json()) as TransactionDetailResponse);
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

    requestAnimationFrame(() => {
      document.getElementById("run-trace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
          ? `AUTO_TAG approved — decision: ${body.decision ?? "unknown"}`
          : `AUTO_TAG rejected — queued for review`,
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
  }> {
    if (!tenantId) {
      throw new Error("Select a tenant first");
    }
    const response = await apiFetch(`/api/transactions/${transactionId}/reprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    const body = (await response.json()) as {
      error?: string;
      decision?: string;
      reason?: string;
      confidence?: number;
    };
    if (!response.ok) {
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }
    return body;
  }

  async function submitReprocess(): Promise<void> {
    if (!tenantId) return;
    setReceiptMessage(null);
    setActionLoading(true);
    try {
      const body = await runReprocess();
      const reasonLabel = body.reason ? ` (${body.reason})` : "";
      setReceiptMessage(
        `Reprocessed — decision: ${body.decision ?? "unknown"}${reasonLabel}${
          body.confidence !== undefined ? ` · confidence ${body.confidence.toFixed(4)}` : ""
        }`,
      );
      invalidateReviewQueueCache(tenantId);
      await loadDetail();
    } catch (err) {
      setReceiptMessage(err instanceof Error ? err.message : "Reprocess failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function submitReceipt(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!tenantId) return;
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
      invalidateReviewQueueCache(tenantId);
      await loadDetail();
    } catch (err) {
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
      setOverrideMessage(
        body.vendorRuleCreated
          ? `Override applied — new vendor rule for GL ${glCode}.`
          : `Override applied — GL ${glCode} (rule already existed).`,
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
  const selectedRunEvents =
    eventRuns.find((group) => group.runId === selectedRunId)?.events ??
    detail?.events.filter((event) => event.runId === selectedRunId) ??
    [];
  const openReview = detail?.review_queue.find((r) => r.status === "open");
  const receiptCleared = Boolean(detail?.receipt?.clearedAt);

  const backHref = tenantId ? `/review-queue` : "/review-queue";

  return (
    <PageLayout
      backHref={backHref}
      backLabel="Review queue"
      loading={loading || actionLoading}
      blocking={loading || actionLoading}
      blockingLabel={actionLoading ? "Saving…" : "Loading transaction…"}
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
                  <span className="stat__label">Suggested GL</span>
                  <span className="stat__value">
                    {detail.transaction.suggested_gl.glCode} — {detail.transaction.suggested_gl.glName}
                  </span>
                </div>
              ) : null}
              {detail.transaction.posted_gl ? (
                <div className="stat">
                  <span className="stat__label">Posted GL</span>
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
                AUTO_TAG transactions post to the sandbox ERP adapter after orchestration completes.
              </p>
            )}
            {detail.transaction.taggingDecision === "AUTO_TAG" && !detail.transaction.erpExternalId ? (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={loading || actionLoading}
                onClick={() => void submitErpPost()}
              >
                Post to ERP (mock)
              </button>
            ) : null}
          </section>

          {eventRuns.length > 0 ? (
            <section className="panel detail-grid__full" style={{ marginBottom: "1rem" }}>
              <h2 className="panel__title">Orchestrator runs</h2>
              <p className="panel__desc">
                Each row is one LangGraph invocation (reprocess creates a new run). Select a run to
                view graph steps and audit trace below.
              </p>
              <ul className="event-run-list">
                {eventRuns.map((run) => {
                  const label = formatEventRunLabel(run.events.map((event) => event.eventType));
                  const isActive = run.runId === selectedRunId;
                  return (
                    <li key={run.runId}>
                      <button
                        type="button"
                        className={`event-run-btn${isActive ? " event-run-btn--active" : ""}`}
                        onClick={() => selectRun(run.runId)}
                        aria-current={isActive ? "true" : undefined}
                      >
                        <span className="event-run-btn__label">{label}</span>
                        <span className="event-run-btn__meta">
                          <code>{run.runId.slice(0, 8)}…</code>
                          <time dateTime={run.createdAt}>
                            {new Date(run.createdAt).toLocaleString()}
                          </time>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <RetrievalContextPanel retrieval={selectedRetrieval} tenantId={tenantId} />

          <div className="detail-grid">
            <section id="run-trace" className="panel panel--muted detail-grid__full">
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "0.75rem",
                }}
              >
                <h2 className="panel__title" style={{ margin: 0 }}>
                  Run trace
                </h2>
                <Link
                  href="/orchestrator"
                  className="btn btn--secondary"
                  style={{ padding: "0.35rem 0.65rem", fontSize: "0.8125rem" }}
                >
                  Orchestrator topology
                </Link>
              </div>
              {selectedRunId ? (
                <TransactionRunTrace audit={selectedAudit ?? null} runEvents={selectedRunEvents} />
              ) : (
                <p className="loading-state">Select a run above to inspect the flow.</p>
              )}
            </section>

            <section className="panel panel--hitl">
              <h2 className="panel__title">AUTO_TAG approval (HITL)</h2>
              {detail.pending_auto_tag ? (
                <>
                  <p className="panel__desc">
                    Graph paused at <code>awaitAutoTagApproval</code>. Approve to post, or reject to
                    queue for review.
                  </p>
                  <p style={{ fontSize: "0.8125rem", marginBottom: "1rem" }}>
                    run_id: <code>{detail.pending_auto_tag.run_id}</code>
                  </p>
                  <div className="btn-group">
                    <button
                      type="button"
                      className="btn btn--success"
                      disabled={loading || actionLoading}
                      onClick={() => void submitAutoTagApproval(true)}
                    >
                      Approve AUTO_TAG
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={loading || actionLoading}
                      onClick={() => void submitAutoTagApproval(false)}
                    >
                      Reject
                    </button>
                  </div>
                  {approveMessage ? (
                    <p className="alert alert--info" style={{ marginTop: "0.75rem" }}>
                      {approveMessage}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="panel__desc">No pending AUTO_TAG approval for this transaction.</p>
              )}
            </section>

            <section className="panel panel--warning">
              <h2 className="panel__title">Receipt (policy gate)</h2>
              <p className="panel__desc">
                Upload mock receipt text — reprocess runs automatically. Use <strong>tenant-a</strong>{" "}
                for the AWS vendor-rule AUTO_TAG path.
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
                Creates or updates a per-tenant vendor rule — similar transactions auto-tag on replay.
              </p>
              <form onSubmit={(e) => void submitOverride(e)} className="form-row">
                <div className="form-field">
                  <label className="form-label" htmlFor="gl-code">
                    GL code
                  </label>
                  <input
                    id="gl-code"
                    className="input"
                    value={glCode}
                    onChange={(e) => setGlCode(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn--primary" disabled={loading || actionLoading}>
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
        </>
      ) : null}
    </PageLayout>
  );
}
