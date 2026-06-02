export interface TransactionEventRow {
  eventType: string;
  runId: string;
  payload: unknown;
  createdAt: string;
}

export interface TransactionEventRunGroup {
  runId: string;
  createdAt: string;
  events: TransactionEventRow[];
}

/**
 * Groups domain events by orchestrator run_id, newest run first.
 *
 * @param events - Flat event list from the transaction detail API.
 * @returns Runs with ordered event types for that invocation.
 */
export function groupTransactionEventsByRun(
  events: TransactionEventRow[],
): TransactionEventRunGroup[] {
  const byRun = new Map<string, TransactionEventRunGroup>();

  for (const event of events) {
    const existing = byRun.get(event.runId);
    if (existing) {
      existing.events.push(event);
      if (event.createdAt > existing.createdAt) {
        existing.createdAt = event.createdAt;
      }
    } else {
      byRun.set(event.runId, {
        runId: event.runId,
        createdAt: event.createdAt,
        events: [event],
      });
    }
  }

  return Array.from(byRun.values()).sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

/**
 * Formats event types for a run as a readable pipeline label.
 *
 * @param eventTypes - Event type strings in emission order.
 * @returns Arrow-separated label.
 */
export function formatEventRunLabel(eventTypes: string[]): string {
  const ordered = [...eventTypes];
  const policyIndex = ordered.indexOf("PolicyEvaluated");
  const taggedIndex = ordered.findIndex((type) =>
    ["TransactionTagged", "TransactionRetagged", "TransactionCreated"].includes(type),
  );

  if (policyIndex > -1 && taggedIndex > -1 && policyIndex > taggedIndex) {
    const policy = ordered.splice(policyIndex, 1)[0];
    ordered.splice(taggedIndex, 0, policy);
  }

  return ordered.join(" → ");
}
