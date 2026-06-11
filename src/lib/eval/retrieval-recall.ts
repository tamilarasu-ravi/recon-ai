import { parseRetrievalFromObservability } from "@/lib/ui/parse-retrieval";

/** Minimum retrieval recall@5 for POC pass (README + capstone-requirements). */
export const RETRIEVAL_RECALL_AT_5_TARGET = 0.8;

export interface RetrievalRecallCaseInput {
  id: string;
  expected_gl_code?: string;
  /** When false, case is excluded from recall@5 denominator (e.g. rule-only paths). */
  expect_retrieval_recall?: boolean;
}

export interface RetrievalRecallCaseResult {
  id: string;
  eligible: boolean;
  hit: boolean | null;
  expected_gl_code?: string;
  neighbor_gl_codes: string[];
}

/**
 * Returns whether an eval case participates in retrieval recall@5.
 *
 * @param evalCase - Eval row with optional GL and recall flag.
 * @returns True when top-5 neighbor GL match should be measured.
 */
export function isRetrievalRecallEligible(evalCase: RetrievalRecallCaseInput): boolean {
  if (evalCase.expect_retrieval_recall === false) {
    return false;
  }
  return evalCase.expected_gl_code !== undefined && evalCase.expected_gl_code.length > 0;
}

/**
 * Checks whether any top-5 retrieval neighbor matches the expected GL code.
 *
 * @param observability - Tagging audit observability JSON from audit_log.
 * @param expectedGlCode - Expected tenant CoA GL code string.
 * @returns True when a neighbor in top-5 has matching gl_code.
 */
export function didRetrievalRecallHit(
  observability: unknown,
  expectedGlCode: string,
): boolean {
  const retrieval = parseRetrievalFromObservability(observability);
  if (!retrieval || retrieval.neighbors.length === 0) {
    return false;
  }

  return retrieval.neighbors.some(
    (neighbor) => neighbor.glCode !== null && neighbor.glCode === expectedGlCode,
  );
}

/**
 * Aggregates retrieval recall@5 across eligible eval cases.
 *
 * @param caseResults - Per-case eligibility and hit outcomes.
 * @returns Rate in [0, 1] or 1 when no eligible cases (vacuous pass).
 */
export function computeRetrievalRecallAt5(caseResults: RetrievalRecallCaseResult[]): number {
  const eligible = caseResults.filter((row) => row.eligible);
  if (eligible.length === 0) {
    return 1;
  }

  const hits = eligible.filter((row) => row.hit === true).length;
  return Number((hits / eligible.length).toFixed(4));
}
