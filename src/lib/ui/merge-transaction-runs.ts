import type { TransactionEventRunGroup } from "@/lib/ui/group-transaction-events";

export interface TransactionRunAuditSummary {
  runId: string;
  decision: string | null;
  confidence: string | null;
  createdAt: string;
}

export interface MergedTransactionRun {
  runId: string;
  createdAt: string;
  events: TransactionEventRunGroup["events"];
  audit: TransactionRunAuditSummary | null;
}

/**
 * Merges domain events and audit rows into a single run history list (newest first).
 *
 * @param eventRuns - Events grouped by run_id from the transaction API.
 * @param auditTrail - Audit log rows keyed by run_id.
 * @returns Unified run entries for the run history panel.
 */
export function mergeTransactionRuns(
  eventRuns: TransactionEventRunGroup[],
  auditTrail: TransactionRunAuditSummary[],
): MergedTransactionRun[] {
  const byRun = new Map<string, MergedTransactionRun>();

  for (const run of eventRuns) {
    byRun.set(run.runId, {
      runId: run.runId,
      createdAt: run.createdAt,
      events: run.events,
      audit: null,
    });
  }

  for (const audit of auditTrail) {
    const existing = byRun.get(audit.runId);
    if (existing) {
      existing.audit = audit;
      if (audit.createdAt > existing.createdAt) {
        existing.createdAt = audit.createdAt;
      }
    } else {
      byRun.set(audit.runId, {
        runId: audit.runId,
        createdAt: audit.createdAt,
        events: [],
        audit,
      });
    }
  }

  return Array.from(byRun.values()).sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
