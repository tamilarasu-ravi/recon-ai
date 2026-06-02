import type { StepSpan } from "@/lib/agents/tagging/run-tagging-agent";

export interface ParsedRetrievalNeighbor {
  transactionId: string;
  externalTransactionId: string | null;
  glAccountId: string;
  glCode: string | null;
  similarity: number;
}

export interface ParsedRetrievalContext {
  neighborCount: number;
  top1Similarity: number;
  supportCount: number;
  agreeFraction: number;
  neighbors: ParsedRetrievalNeighbor[];
  labeledCorpusHint?: string;
}

/**
 * Reads the retrieval step from tagging audit observability.
 *
 * @param observability - Raw audit_log.observability JSON.
 * @returns Parsed retrieval context or null when no retrieval step exists.
 */
export function parseRetrievalFromObservability(
  observability: unknown,
): ParsedRetrievalContext | null {
  if (!observability || typeof observability !== "object") {
    return null;
  }

  const steps = (observability as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) {
    return null;
  }

  const retrievalStep = steps.find(
    (step): step is StepSpan =>
      typeof step === "object" &&
      step !== null &&
      "name" in step &&
      (step as StepSpan).name === "retrieval",
  );

  if (!retrievalStep?.detail || typeof retrievalStep.detail !== "object") {
    return null;
  }

  const detail = retrievalStep.detail as Record<string, unknown>;
  const neighborsRaw = Array.isArray(detail.neighbors) ? detail.neighbors : [];

  const neighbors: ParsedRetrievalNeighbor[] = neighborsRaw
    .map((row) => parseNeighborRow(row))
    .filter((row): row is ParsedRetrievalNeighbor => row !== null);

  return {
    neighborCount:
      typeof detail.neighbor_count === "number" ? detail.neighbor_count : neighbors.length,
    top1Similarity: typeof detail.top1_sim === "number" ? detail.top1_sim : 0,
    supportCount: typeof detail.support_count === "number" ? detail.support_count : 0,
    agreeFraction: typeof detail.agree_frac === "number" ? detail.agree_frac : 0,
    neighbors,
    labeledCorpusHint:
      typeof detail.labeled_corpus_count === "number"
        ? `${detail.labeled_corpus_count} labeled transactions in tenant corpus`
        : undefined,
  };
}

function parseNeighborRow(row: unknown): ParsedRetrievalNeighbor | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const record = row as Record<string, unknown>;
  const transactionId =
    typeof record.transaction_id === "string" ? record.transaction_id : null;
  const glAccountId = typeof record.gl_account_id === "string" ? record.gl_account_id : null;
  const similarity = typeof record.similarity === "number" ? record.similarity : null;

  if (!transactionId || !glAccountId || similarity === null) {
    return null;
  }

  return {
    transactionId,
    externalTransactionId:
      typeof record.external_transaction_id === "string"
        ? record.external_transaction_id
        : null,
    glAccountId,
    glCode: typeof record.gl_code === "string" ? record.gl_code : null,
    similarity,
  };
}
