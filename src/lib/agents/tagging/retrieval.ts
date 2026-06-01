import { sql } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";

export interface RetrievalNeighbor {
  transactionId: string;
  glAccountId: string;
  similarity: number;
}

const DEFAULT_TOP_K = 5;

/**
 * Retrieves top-k similar labeled transactions for a tenant using pgvector cosine distance.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param queryEmbedding - Query embedding vector.
 * @param topK - Number of neighbors to return.
 * @returns Neighbors sorted by descending similarity.
 */
export async function retrieveSimilarTransactions(
  db: DbClient,
  tenantId: string,
  queryEmbedding: number[],
  topK: number = DEFAULT_TOP_K,
): Promise<RetrievalNeighbor[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const result = await db.execute<{
    transaction_id: string;
    gl_account_id: string;
    similarity: number;
  }>(sql`
    SELECT
      t.id AS transaction_id,
      t.gl_account_id AS gl_account_id,
      (1 - (e.embedding <=> ${vectorLiteral}::vector))::float AS similarity
    FROM transaction_embeddings e
    INNER JOIN transactions t ON t.id = e.transaction_id
    WHERE e.tenant_id = ${tenantId}
      AND t.gl_account_id IS NOT NULL
    ORDER BY e.embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `);

  return result.map((row) => ({
    transactionId: row.transaction_id,
    glAccountId: row.gl_account_id,
    similarity: Number(row.similarity),
  }));
}

/**
 * Counts labeled transactions for a tenant (used for hasMinHistory gate).
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Count of transactions with a ground-truth GL label.
 */
export async function countLabeledTransactions(db: DbClient, tenantId: string): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM transactions
    WHERE tenant_id = ${tenantId}
      AND gl_account_id IS NOT NULL
  `);

  return Number(result[0]?.count ?? 0);
}
