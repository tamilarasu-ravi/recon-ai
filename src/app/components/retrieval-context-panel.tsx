"use client";

import Link from "next/link";

import type { ParsedRetrievalContext } from "@/lib/ui/parse-retrieval";

interface RetrievalContextPanelProps {
  retrieval: ParsedRetrievalContext | null;
  tenantId: string | null;
}

/**
 * Shows top-k labeled neighbors used as RAG context for the selected tagging run.
 *
 * @param props - Parsed retrieval audit and tenant for neighbor links.
 * @returns Panel explaining similarity search results.
 */
export function RetrievalContextPanel({
  retrieval,
  tenantId,
}: RetrievalContextPanelProps): React.ReactElement {
  if (!retrieval) {
    return (
      <section className="panel panel--muted detail-grid__full" id="rag-context">
        <h2 className="panel__title">Label memory (RAG)</h2>
        <p className="panel__desc">
          No retrieval step in this run&apos;s audit — older runs may only store neighbor counts.
          Reprocess to refresh with full neighbor detail.
        </p>
      </section>
    );
  }

  return (
    <section className="panel panel--muted detail-grid__full" id="rag-context">
      <h2 className="panel__title">Label memory (RAG)</h2>
      <p className="panel__desc">
        Similar labeled transactions retrieved via pgvector (cosine). These neighbors are injected
        into the tagging LLM prompt and feed the confidence scorer.
      </p>

      <div className="stat-grid" style={{ marginBottom: "1rem" }}>
        <div className="stat">
          <span className="stat__label">Top-1 similarity</span>
          <span className="stat__value">{retrieval.top1Similarity.toFixed(3)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">GL agreement</span>
          <span className="stat__value">
            {retrieval.supportCount}/{retrieval.neighborCount} (
            {(retrieval.agreeFraction * 100).toFixed(0)}%)
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Neighbors</span>
          <span className="stat__value">{retrieval.neighborCount}</span>
        </div>
      </div>

      {retrieval.labeledCorpusHint ? (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
          {retrieval.labeledCorpusHint}
        </p>
      ) : null}

      {retrieval.neighbors.length === 0 ? (
        <p className="alert alert--error">No labeled neighbors found — cold start or weak corpus.</p>
      ) : (
        <ul className="retrieval-neighbor-list">
          {retrieval.neighbors.map((neighbor, index) => (
            <li key={neighbor.transactionId}>
              <span className="retrieval-neighbor-list__rank">#{index + 1}</span>
              <span className="retrieval-neighbor-list__sim">{neighbor.similarity.toFixed(3)}</span>
              <code className="retrieval-neighbor-list__gl">
                {neighbor.glCode ?? neighbor.glAccountId.slice(0, 8)}
              </code>
              {tenantId ? (
                <Link
                  href={`/transactions/${neighbor.transactionId}?tenant_id=${encodeURIComponent(tenantId)}`}
                  className="inline-link retrieval-neighbor-list__txn"
                >
                  {neighbor.externalTransactionId ?? neighbor.transactionId.slice(0, 8)}
                </Link>
              ) : (
                <code>{neighbor.externalTransactionId ?? neighbor.transactionId}</code>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
