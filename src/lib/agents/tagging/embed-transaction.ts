import { eq } from "drizzle-orm";

import type { AppEnv } from "@/lib/config/env";
import { createLlmClient } from "@/lib/llm/client";
import type { DbClient } from "@/lib/db/client";
import { transactionEmbeddings } from "@/lib/db/schema";

/**
 * Builds a deterministic unit vector from text (for seed/eval without live embedding API).
 *
 * @param text - Input text.
 * @param dimensions - Embedding dimension size.
 * @returns Normalized pseudo-embedding vector.
 */
export function buildDeterministicEmbedding(text: string, dimensions: number): number[] {
  const normalized = text.toLowerCase().trim();
  const segments = normalized.split(" | ").filter(Boolean);
  const vendorSegment = segments[0] ?? normalized;
  // Weight vendor tokens so recall@5 prefers same-vendor neighbors (eval + seed use same fn).
  const weightedText =
    segments.length > 1
      ? [vendorSegment, vendorSegment, vendorSegment, ...segments.slice(1)].join(" | ")
      : [vendorSegment, vendorSegment, vendorSegment].join(" | ");

  const vector = new Array<number>(dimensions).fill(0);
  for (let index = 0; index < weightedText.length; index += 1) {
    vector[index % dimensions] += weightedText.charCodeAt(index) / 255;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

/**
 * Builds embedding text from transaction fields for vector retrieval.
 *
 * @param vendorRaw - Raw vendor string.
 * @param memo - Optional memo text.
 * @param mcc - Optional merchant category code.
 * @returns Concatenated text for embedding.
 */
export function buildEmbeddingText(vendorRaw: string, memo?: string, mcc?: string): string {
  return [vendorRaw.toLowerCase().trim(), memo?.toLowerCase().trim() ?? "", mcc ?? ""]
    .filter(Boolean)
    .join(" | ");
}

/**
 * Embeds a transaction and upserts into transaction_embeddings (tenant-scoped).
 *
 * @param db - Database client.
 * @param env - Application environment.
 * @param tenantId - Tenant UUID.
 * @param transactionId - Transaction UUID.
 * @param vendorRaw - Vendor string.
 * @param memo - Optional memo.
 * @param mcc - Optional MCC.
 * @returns Embedding vector length.
 */
export async function embedAndStoreTransaction(
  db: DbClient,
  env: AppEnv,
  tenantId: string,
  transactionId: string,
  vendorRaw: string,
  memo?: string,
  mcc?: string,
): Promise<number> {
  const llm = createLlmClient(env);
  const text = buildEmbeddingText(vendorRaw, memo, mcc);
  const embedding = await llm.embedText(text);

  const existing = await db
    .select({ id: transactionEmbeddings.id })
    .from(transactionEmbeddings)
    .where(eq(transactionEmbeddings.transactionId, transactionId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(transactionEmbeddings)
      .set({
        embedding,
        embeddingModel: env.EMBEDDING_MODEL,
      })
      .where(eq(transactionEmbeddings.transactionId, transactionId));
  } else {
    await db.insert(transactionEmbeddings).values({
      tenantId,
      transactionId,
      embedding,
      embeddingModel: env.EMBEDDING_MODEL,
    });
  }

  return embedding.length;
}
