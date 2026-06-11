import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDeterministicEmbedding,
  buildEmbeddingText,
} from "@/lib/agents/tagging/embed-transaction";

const DIMENSIONS = 64;

/**
 * Cosine similarity between two embedding vectors.
 *
 * @param left - First vector.
 * @param right - Second vector.
 * @returns Similarity in [-1, 1].
 */
function cosineSimilarity(left: number[], right: number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  return dot;
}

describe("deterministic embeddings", () => {
  it("matches vendor case-insensitively closer than unrelated vendors", () => {
    const awsQuery = buildDeterministicEmbedding(
      buildEmbeddingText("AWS", "ec2 instances"),
      DIMENSIONS,
    );
    const awsSeed = buildDeterministicEmbedding(
      buildEmbeddingText("aws", "ec2 hosting"),
      DIMENSIONS,
    );
    const starbucksSeed = buildDeterministicEmbedding(
      buildEmbeddingText("starbucks", "team coffee"),
      DIMENSIONS,
    );

    assert.ok(cosineSimilarity(awsQuery, awsSeed) > cosineSimilarity(awsQuery, starbucksSeed));
  });
});
