"use client";

import Link from "next/link";

import type { ParsedRetrievalContext } from "@/lib/ui/parse-retrieval";

interface RetrievalContextPanelProps {
  retrieval: ParsedRetrievalContext | null;
  tenantId: string | null;
}

/**
 * Shows similar labeled expenses used as context for the tagging decision.
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
        <h2 className="panel__title">Similar past expenses</h2>
        <p className="panel__desc">
          No similar transactions were found for this processing run. Reprocess to refresh the
          comparison set.
        </p>
      </section>
    );
  }

  return (
    <section className="panel panel--muted detail-grid__full" id="rag-context">
      <h2 className="panel__title">Similar past expenses</h2>
      <p className="panel__desc">
        Labeled history that informed the suggested account and confidence score for this expense.
      </p>

      <div className="stat-grid" style={{ marginBottom: "1rem" }}>
        <div className="stat">
          <span className="stat__label">Best match score</span>
          <span className="stat__value">{retrieval.top1Similarity.toFixed(3)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Account agreement</span>
          <span className="stat__value">
            {retrieval.supportCount}/{retrieval.neighborCount} (
            {(retrieval.agreeFraction * 100).toFixed(0)}%)
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Matches shown</span>
          <span className="stat__value">{retrieval.neighborCount}</span>
        </div>
      </div>

      {retrieval.labeledCorpusHint ? (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
          {retrieval.labeledCorpusHint.replace("labeled transactions in tenant corpus", "labeled expenses on file")}
        </p>
      ) : null}

      {retrieval.neighbors.length === 0 ? (
        <p className="alert alert--error">
          No similar labeled expenses found — this may be a new vendor or category.
        </p>
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
