import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

const llmProviderSchema = z.enum(["google", "openai", "anthropic"]);

/**
 * Parses and validates environment variables required by the application.
 *
 * @returns Validated environment configuration object.
 * @throws ZodError when required variables are missing or invalid.
 */
export function loadEnv() {
  const parsed = z
    .object({
      DATABASE_URL: z.string().min(1),
      LLM_PROVIDER: llmProviderSchema.default("google"),
      LLM_MODEL: z.string().min(1).default("gemini-2.0-flash"),
      LLM_MODEL_AP: z.string().min(1).optional(),
      EMBEDDING_MODEL: z.string().min(1).default("text-embedding-004"),
      EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
      GOOGLE_API_KEY: z.string().optional(),
      OPENAI_API_KEY: z.string().optional(),
      ANTHROPIC_API_KEY: z.string().optional(),
      TAG_AUTO_THRESHOLD: z.coerce.number().min(0).max(1).default(0.92),
      TAG_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
      LLM_ENABLE_LIVE_CALLS: z
        .enum(["true", "false"])
        .default("true")
        .transform((value) => value === "true"),
      LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(3),
    })
    .parse(process.env);

  if (parsed.LLM_PROVIDER === "google" && !parsed.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is required when LLM_PROVIDER=google");
  }
  if (parsed.LLM_PROVIDER === "openai" && !parsed.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
  }
  if (parsed.LLM_PROVIDER === "anthropic" && !parsed.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic");
  }

  return parsed;
}

export type AppEnv = ReturnType<typeof loadEnv>;

/**
 * Generates a new run identifier for orchestrator tracing.
 *
 * @returns UUID string used as run_id in audit and events.
 */
export function newRunId(): string {
  return randomUUID();
}

/**
 * Derives a deterministic idempotency key for transaction ingest.
 *
 * @param tenantId - Tenant UUID.
 * @param externalTransactionId - Upstream transaction identifier.
 * @param transactionTimestampIso - ISO timestamp from source system.
 * @returns SHA-256 hex digest used as idempotency_key.
 */
export function deriveIdempotencyKey(
  tenantId: string,
  externalTransactionId: string,
  transactionTimestampIso: string,
): string {
  return createHash("sha256")
    .update(`${tenantId}:${externalTransactionId}:${transactionTimestampIso}`)
    .digest("hex");
}
