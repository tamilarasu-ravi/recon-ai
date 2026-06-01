"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useTenant } from "@/app/components/tenant-provider";
import { parseObservability } from "@/lib/ui/parse-audit";
import { formatReasonLabel, reasonChipColor } from "@/lib/ui/reason-labels";

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
    suggested_gl: { glCode: string; glName: string } | null;
    posted_gl: { glCode: string; glName: string } | null;
  };
  review_queue: Array<{ reason: string; status: string; runId: string }>;
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
}

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "2rem",
  maxWidth: 800,
};

/**
 * Transaction detail with audit trace, LLM skip reason, and override form.
 *
 * @returns Transaction detail view.
 */
export function TransactionDetailClient(): React.ReactElement {
  const params = useParams();
  const searchParams = useSearchParams();
  const { tenantId: contextTenantId } = useTenant();
  const transactionId = typeof params.id === "string" ? params.id : "";
  const tenantId = searchParams.get("tenant_id") ?? contextTenantId;

  const [detail, setDetail] = useState<TransactionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [glCode, setGlCode] = useState("6200");
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [receiptText, setReceiptText] = useState("Receipt uploaded via UI");
  const [receiptMessage, setReceiptMessage] = useState<string | null>(null);

  const loadDetail = useCallback(async (): Promise<void> => {
    if (!tenantId || !transactionId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
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

  async function submitReceipt(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!tenantId) return;
    setReceiptMessage(null);
    try {
      const response = await fetch("/api/receipts", {
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
      setReceiptMessage("Receipt cleared — reprocess tagging to apply AUTO_TAG if eligible.");
    } catch (err) {
      setReceiptMessage(err instanceof Error ? err.message : "Receipt upload failed");
    }
  }

  async function submitReprocess(): Promise<void> {
    if (!tenantId) return;
    setReceiptMessage(null);
    try {
      const response = await fetch(`/api/transactions/${transactionId}/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      const body = (await response.json()) as { error?: string; decision?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      setReceiptMessage(`Reprocessed — decision: ${body.decision ?? "unknown"}`);
      await loadDetail();
    } catch (err) {
      setReceiptMessage(err instanceof Error ? err.message : "Reprocess failed");
    }
  }

  async function submitOverride(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!tenantId) return;
    setOverrideMessage(null);
    try {
      const response = await fetch(`/api/transactions/${transactionId}/override`, {
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
      await loadDetail();
    } catch (err) {
      setOverrideMessage(err instanceof Error ? err.message : "Override failed");
    }
  }

  const latestAudit = detail?.audit_trail[0];
  const observability = parseObservability(latestAudit?.observability);
  const openReview = detail?.review_queue.find((r) => r.status === "open");

  return (
    <main style={pageStyle}>
      <p>
        <Link href="/review-queue">← Review queue</Link>
      </p>

      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {detail ? (
        <>
          <h1 style={{ marginTop: 0 }}>{detail.transaction.vendorRaw}</h1>
          <p>
            {detail.transaction.amount} {detail.transaction.currency} ·{" "}
            <code>{detail.transaction.externalTransactionId}</code>
          </p>
          {detail.transaction.memo ? (
            <p style={{ color: "#555" }}>Memo: {detail.transaction.memo}</p>
          ) : null}

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Decision</h2>
            <p>
              <strong>{detail.transaction.taggingDecision}</strong>
              {detail.transaction.confidence ? ` · confidence ${detail.transaction.confidence}` : null}
            </p>
            {detail.transaction.suggested_gl ? (
              <p>
                Suggested: GL {detail.transaction.suggested_gl.glCode} —{" "}
                {detail.transaction.suggested_gl.glName}
              </p>
            ) : null}
            {detail.transaction.posted_gl ? (
              <p>
                Posted: GL {detail.transaction.posted_gl.glCode} — {detail.transaction.posted_gl.glName}
              </p>
            ) : null}
            {openReview ? (
              <span
                style={{
                  display: "inline-block",
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.5rem",
                  borderRadius: 999,
                  background: reasonChipColor(openReview.reason),
                }}
              >
                {formatReasonLabel(openReview.reason)}
              </span>
            ) : null}
          </section>

          <section style={{ marginTop: "1.5rem", padding: "1rem", background: "#f9fafb", borderRadius: 8 }}>
            <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>Why (latest run)</h2>
            {latestAudit ? (
              <>
                <p style={{ fontSize: "0.875rem", color: "#666" }}>
                  run_id: <code>{latestAudit.runId}</code> · agent {latestAudit.agent}
                  {latestAudit.policyVersion ? ` · policy ${latestAudit.policyVersion}` : null}
                </p>
                {observability.llm_skipped ? (
                  <p>
                    <strong>LLM skipped:</strong>{" "}
                    {observability.llm_skipped_reason ?? "rule-first match"}
                  </p>
                ) : (
                  <p>LLM used for tagging suggestion.</p>
                )}
                {observability.policy_outcome ? (
                  <p>Policy: {observability.policy_outcome}</p>
                ) : null}
                {observability.receipt_blocked ? <p>Receipt blocked AUTO_TAG.</p> : null}
                {Array.isArray(observability.steps) && observability.steps.length > 0 ? (
                  <details>
                    <summary style={{ cursor: "pointer" }}>Step trace ({observability.steps.length})</summary>
                    <pre
                      style={{
                        fontSize: "0.75rem",
                        overflow: "auto",
                        maxHeight: 240,
                        background: "#fff",
                        padding: "0.75rem",
                        borderRadius: 6,
                      }}
                    >
                      {JSON.stringify(observability.steps, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </>
            ) : (
              <p>No audit entries yet.</p>
            )}
          </section>

          <section style={{ marginTop: "1.5rem", padding: "1rem", background: "#fffbeb", borderRadius: 8 }}>
            <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>Receipt (policy gate)</h2>
            <p style={{ fontSize: "0.875rem", color: "#666" }}>
              Upload mock receipt text, then reprocess tagging (demo steps 2–3).
            </p>
            <form onSubmit={(e) => void submitReceipt(e)} style={{ marginBottom: "0.75rem" }}>
              <textarea
                value={receiptText}
                onChange={(e) => setReceiptText(e.target.value)}
                rows={2}
                style={{ width: "100%", padding: "0.35rem", marginBottom: "0.5rem" }}
              />
              <button type="submit" style={{ padding: "0.35rem 0.75rem", marginRight: "0.5rem" }}>
                Upload receipt
              </button>
              <button type="button" onClick={() => void submitReprocess()} style={{ padding: "0.35rem 0.75rem" }}>
                Reprocess tagging
              </button>
            </form>
            {receiptMessage ? <p style={{ fontSize: "0.875rem" }}>{receiptMessage}</p> : null}
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1.1rem" }}>Accountant override</h2>
            <p style={{ fontSize: "0.875rem", color: "#666" }}>
              Creates or updates a per-tenant vendor rule — similar transactions auto-tag on replay.
            </p>
            <form onSubmit={(e) => void submitOverride(e)} style={{ display: "flex", gap: "0.5rem" }}>
              <label>
                GL code
                <input
                  value={glCode}
                  onChange={(e) => setGlCode(e.target.value)}
                  style={{ marginLeft: "0.5rem", padding: "0.35rem" }}
                />
              </label>
              <button type="submit" style={{ padding: "0.35rem 0.75rem" }}>
                Apply override
              </button>
            </form>
            {overrideMessage ? <p style={{ marginTop: "0.75rem" }}>{overrideMessage}</p> : null}
          </section>

          {detail.events.length > 0 ? (
            <section style={{ marginTop: "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem" }}>Events</h2>
              <ul style={{ fontSize: "0.875rem", paddingLeft: "1.25rem" }}>
                {detail.events.slice(0, 8).map((ev, index) => (
                  <li key={`${ev.runId}-${index}`}>
                    {ev.eventType} · <code>{ev.runId.slice(0, 8)}…</code>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
