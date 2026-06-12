/** Must match pgvector column width in schema (transaction_embeddings.embedding). */
export const PGVECTOR_EMBEDDING_DIMENSIONS = 768;

/**
 * Ensures configured embedding dimensions match the pgvector schema before writes or retrieval.
 *
 * @param configuredDimensions - Value from EMBEDDING_DIMENSIONS env.
 * @throws Error when dimensions differ from PGVECTOR_EMBEDDING_DIMENSIONS.
 */
export function assertEmbeddingDimensionsMatchSchema(configuredDimensions: number): void {
  if (configuredDimensions !== PGVECTOR_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `EMBEDDING_DIMENSIONS=${configuredDimensions} but pgvector column is vector(${PGVECTOR_EMBEDDING_DIMENSIONS}). ` +
        "Re-embed after a dimension migration or set EMBEDDING_DIMENSIONS=768.",
    );
  }
}
