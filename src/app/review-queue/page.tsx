"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useTenant } from "@/app/components/tenant-provider";
import { formatReasonLabel, reasonChipColor } from "@/lib/ui/reason-labels";

type QueueStatus = "open" | "resolved" | "all";

interface ReviewQueueItem {
  id: string;
  reason: string;
  status: string;
  runId: string;
  createdAt: string;
  transactionId: string;
  externalTransactionId: string;
  vendorRaw: string;
  amount: string;
  currency: string;
  taggingDecision: string | null;
  confidence: string | null;
  suggestedGlCode: string | null;
}

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  padding: "2rem",
  maxWidth: 960,
};

/**
 * Review queue list with status filter and reason chips (Phase C UI).
 *
 * @returns Review queue page.
 */
export default function ReviewQueuePage(): React.ReactElement {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [status, setStatus] = useState<QueueStatus>("open");
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async (): Promise<void> => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        tenant_id: tenantId,
        status,
        limit: "50",
      });
      const response = await fetch(`/api/review-queue?${params}`);
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      const data = (await response.json()) as { items: ReviewQueueItem[] };
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, status]);

  useEffect(() => {
    if (!tenantLoading && tenantId) {
      void loadQueue();
    }
  }, [tenantId, tenantLoading, loadQueue]);

  return (
    <main style={pageStyle}>
      <h1 style={{ marginTop: 0 }}>Review queue</h1>
      <p style={{ color: "#555" }}>
        Transactions in <code>QUEUE_REVIEW</code> or <code>REFUSE</code> awaiting accountant action.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {(["open", "resolved", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: 6,
              border: status === value ? "2px solid #111" : "1px solid #ccc",
              background: status === value ? "#f9fafb" : "#fff",
              cursor: "pointer",
            }}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void loadQueue()}
          disabled={loading}
          style={{ marginLeft: "auto", padding: "0.4rem 0.75rem" }}
        >
          Refresh
        </button>
      </div>

      {loading ? <p>Loading…</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!loading && items.length === 0 ? (
        <p style={{ color: "#666" }}>No items for this filter.</p>
      ) : null}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "1rem",
              marginBottom: "0.75rem",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <strong>{item.vendorRaw}</strong>
              <span>
                {item.amount} {item.currency}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.5rem",
                  borderRadius: 999,
                  background: reasonChipColor(item.reason),
                }}
              >
                {formatReasonLabel(item.reason)}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#666" }}>{item.taggingDecision}</span>
              {item.suggestedGlCode ? (
                <span style={{ fontSize: "0.875rem" }}>GL {item.suggestedGlCode}</span>
              ) : null}
            </div>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "#666" }}>
              {item.externalTransactionId} · conf {item.confidence ?? "—"}
            </p>
            <Link
              href={`/transactions/${item.transactionId}?tenant_id=${tenantId}`}
              style={{ fontSize: "0.875rem" }}
            >
              Why &amp; override →
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
