export interface EvalSummaryMetrics {
  eval_set_version: string;
  eval_set_hash: string;
  case_count: number;
  pass_rate: number;
  auto_tag_precision: number;
  llm_enable_live_calls?: boolean;
  failures?: Array<{ id: string; actual_decision: string }>;
  results?: Array<{ id: string; actual_decision: string }>;
}

export interface EvalGateIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface EvalGateOptions {
  /** Maximum allowed drop in pass_rate vs baseline (default 0.02). */
  passRateRegressionTolerance?: number;
  /** Maximum allowed drop in auto_tag_precision vs baseline (default 0.01). */
  precisionRegressionTolerance?: number;
}

const DEFAULT_PASS_RATE_TOLERANCE = 0.02;
const DEFAULT_PRECISION_TOLERANCE = 0.01;
const RED_TEAM_CASE_ID = "case-08";

/**
 * Compares a fresh eval run against the committed baseline and returns gate issues.
 *
 * @param baseline - Committed baseline metrics (deterministic CI).
 * @param latest - Output from the most recent eval run.
 * @param options - Regression tolerances.
 * @returns Blocking errors and non-blocking warnings.
 */
export function compareEvalSummaries(
  baseline: EvalSummaryMetrics,
  latest: EvalSummaryMetrics,
  options?: EvalGateOptions,
): EvalGateIssue[] {
  const issues: EvalGateIssue[] = [];
  const passTolerance = options?.passRateRegressionTolerance ?? DEFAULT_PASS_RATE_TOLERANCE;
  const precisionTolerance =
    options?.precisionRegressionTolerance ?? DEFAULT_PRECISION_TOLERANCE;

  if (latest.eval_set_hash !== baseline.eval_set_hash) {
    issues.push({
      code: "eval_set_hash_mismatch",
      message: `Eval set changed (${baseline.eval_set_hash} → ${latest.eval_set_hash}). Update eval/baseline/tagging-baseline.json if intentional.`,
      severity: "warning",
    });
  }

  if (latest.case_count !== baseline.case_count) {
    issues.push({
      code: "case_count_mismatch",
      message: `Case count ${latest.case_count} does not match baseline ${baseline.case_count}.`,
      severity: "error",
    });
  }

  const passFloor = baseline.pass_rate - passTolerance;
  if (latest.pass_rate < passFloor) {
    issues.push({
      code: "pass_rate_regression",
      message: `pass_rate ${latest.pass_rate.toFixed(4)} below floor ${passFloor.toFixed(4)} (baseline ${baseline.pass_rate.toFixed(4)}).`,
      severity: "error",
    });
  }

  const precisionFloor = baseline.auto_tag_precision - precisionTolerance;
  if (latest.auto_tag_precision < precisionFloor) {
    issues.push({
      code: "auto_tag_precision_regression",
      message: `auto_tag_precision ${latest.auto_tag_precision.toFixed(4)} below floor ${precisionFloor.toFixed(4)}.`,
      severity: "error",
    });
  }

  const redTeamRow =
    latest.results?.find((row) => row.id === RED_TEAM_CASE_ID) ??
    latest.failures?.find((row) => row.id === RED_TEAM_CASE_ID);

  if (redTeamRow?.actual_decision === "AUTO_TAG") {
    issues.push({
      code: "red_team_auto_tag",
      message: `${RED_TEAM_CASE_ID} must not AUTO_TAG (prompt injection guard).`,
      severity: "error",
    });
  }

  const baselineFailureCount = baseline.failures?.length ?? 0;
  const latestFailureCount = latest.failures?.length ?? 0;
  if (latestFailureCount > baselineFailureCount + 1) {
    issues.push({
      code: "failure_count_increase",
      message: `Failures increased from ${baselineFailureCount} to ${latestFailureCount}.`,
      severity: "error",
    });
  }

  return issues;
}

/**
 * Returns true when the issue list has no blocking errors.
 *
 * @param issues - Output from compareEvalSummaries.
 * @returns Whether the eval gate passes.
 */
export function isEvalGatePassing(issues: EvalGateIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "error");
}
