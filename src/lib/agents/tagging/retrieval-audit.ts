import { inArray } from "drizzle-orm";

import type { CoaEntry } from "@/lib/agents/tagging/suggest";
import type { RetrievalNeighbor } from "@/lib/agents/tagging/retrieval";
import type { DbClient } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";

export interface RetrievalNeighborAuditRow {
  transaction_id: string;
  external_transaction_id: string | null;
  gl_account_id: string;
  gl_code: string | null;
  similarity: number;
}

/**
 * Maps retrieval neighbors to audit-friendly rows with CoA codes and external ids.
 *
 * @param db - Database client.
 * @param neighbors - pgvector neighbors for the current transaction.
 * @param coaRows - Tenant chart of accounts entries.
 * @returns Neighbor rows for observability / UI.
 */
export async function buildRetrievalNeighborAuditRows(
  db: DbClient,
  neighbors: RetrievalNeighbor[],
  coaRows: CoaEntry[],
): Promise<RetrievalNeighborAuditRow[]> {
  if (neighbors.length === 0) {
    return [];
  }

  const coaById = new Map(coaRows.map((row) => [row.id, row.glCode]));
  const transactionIds = neighbors.map((neighbor) => neighbor.transactionId);

  const txnRows = await db
    .select({
      id: transactions.id,
      externalTransactionId: transactions.externalTransactionId,
    })
    .from(transactions)
    .where(inArray(transactions.id, transactionIds));

  const externalById = new Map(txnRows.map((row) => [row.id, row.externalTransactionId]));

  return neighbors.map((neighbor) => ({
    transaction_id: neighbor.transactionId,
    external_transaction_id: externalById.get(neighbor.transactionId) ?? null,
    gl_account_id: neighbor.glAccountId,
    gl_code: coaById.get(neighbor.glAccountId) ?? null,
    similarity: neighbor.similarity,
  }));
}
