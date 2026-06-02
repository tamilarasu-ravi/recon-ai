import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

const llmProviderSchema = z.enum(["google", "openai", "anthropic"]);

type LlmProvider = z.infer<typeof llmProviderSchema>;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  LLM_PROVIDER: llmProviderSchema.default("google"),
  LLM_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  LLM_MODEL_AP: z.string().min(1).optional(),
  EMBEDDING_MODEL: z.string().min(1).default("gemini-embedding-001"),
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
  AUTO_TAG_HITL_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  LANGGRAPH_CHECKPOINTER: z.enum(["postgres", "memory"]).default("postgres"),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Returns true when the active provider has a non-empty API key configured.
 *
 * @param env - Validated environment configuration.
 * @returns Whether live LLM/embedding calls can authenticate.
 */
export function hasProviderApiKey(env: AppEnv): boolean {
  switch (env.LLM_PROVIDER) {
    case "google":
      return Boolean(env.GOOGLE_API_KEY?.trim());
    case "openai":
      return Boolean(env.OPENAI_API_KEY?.trim());
    case "anthropic":
      return Boolean(env.ANTHROPIC_API_KEY?.trim());
    default:
      return false;
  }
}

/**
 * Picks a provider that has credentials, preferring google (project default).
 *
 * @param env - Parsed environment before provider resolution.
 * @returns Resolved provider id.
 */
function resolveLlmProvider(env: AppEnv): LlmProvider {
  if (hasProviderApiKey(env)) {
    return env.LLM_PROVIDER;
  }

  if (env.GOOGLE_API_KEY?.trim()) {
    return "google";
  }
  if (env.OPENAI_API_KEY?.trim()) {
    return "openai";
  }
  if (env.ANTHROPIC_API_KEY?.trim()) {
    return "anthropic";
  }

  return env.LLM_PROVIDER;
}

/**
 * Aligns model names with the resolved provider when .env still has stale OpenAI defaults.
 *
 * @param env - Environment with resolved provider.
 * @returns Environment with provider-appropriate model defaults.
 */
function alignModelsForProvider(env: AppEnv): AppEnv {
  const googleDefaultModel = "gemini-2.5-flash";
  const retiredGoogleModels = new Set(["gemini-2.0-flash", "gemini-2.0-flash-lite"]);

  if (env.LLM_PROVIDER === "google") {
    let llmModel = env.LLM_MODEL;
    if (llmModel.includes("gpt")) {
      llmModel = googleDefaultModel;
    } else if (retiredGoogleModels.has(llmModel)) {
      llmModel = googleDefaultModel;
    }

    return {
      ...env,
      LLM_MODEL: llmModel,
      LLM_MODEL_AP:
        env.LLM_MODEL_AP && !retiredGoogleModels.has(env.LLM_MODEL_AP)
          ? env.LLM_MODEL_AP
          : llmModel,
      EMBEDDING_MODEL:
        env.EMBEDDING_MODEL === "text-embedding-3-small" ||
        env.EMBEDDING_MODEL === "text-embedding-004"
          ? "gemini-embedding-001"
          : env.EMBEDDING_MODEL,
      EMBEDDING_DIMENSIONS: env.EMBEDDING_DIMENSIONS === 1536 ? 768 : env.EMBEDDING_DIMENSIONS,
    };
  }

  if (env.LLM_PROVIDER === "openai") {
    return {
      ...env,
      LLM_MODEL: env.LLM_MODEL.includes("gemini") ? "gpt-4o-mini" : env.LLM_MODEL,
      EMBEDDING_MODEL:
        env.EMBEDDING_MODEL === "gemini-embedding-001" ||
        env.EMBEDDING_MODEL === "text-embedding-004"
          ? "text-embedding-3-small"
          : env.EMBEDDING_MODEL,
      EMBEDDING_DIMENSIONS: env.EMBEDDING_DIMENSIONS === 768 ? 1536 : env.EMBEDDING_DIMENSIONS,
    };
  }

  return env;
}

/**
 * Parses and validates environment variables required by the application.
 *
 * @returns Validated environment configuration object.
 * @throws Error when live calls are enabled but no API key is available for the provider.
 */
export function loadEnv(): AppEnv {
  const parsed = envSchema.parse(process.env);
  const declaredProvider = parsed.LLM_PROVIDER;
  const resolvedProvider = resolveLlmProvider(parsed);

  let env: AppEnv = { ...parsed, LLM_PROVIDER: resolvedProvider };

  if (resolvedProvider !== declaredProvider) {
    console.warn(
      `[env] LLM_PROVIDER=${declaredProvider} has no API key; using ${resolvedProvider} instead. ` +
        "Update .env: LLM_PROVIDER=google",
    );
  }

  env = alignModelsForProvider(env);

  if (env.LLM_ENABLE_LIVE_CALLS && !hasProviderApiKey(env)) {
    throw new Error(
      `No API key for LLM_PROVIDER=${env.LLM_PROVIDER}. Set GOOGLE_API_KEY (recommended) or OPENAI_API_KEY, ` +
        "or set LLM_ENABLE_LIVE_CALLS=false for fixture/seed mode.",
    );
  }

  if (env.LLM_ENABLE_LIVE_CALLS) {
    if (env.LLM_PROVIDER === "google" && !env.GOOGLE_API_KEY?.trim()) {
      throw new Error("GOOGLE_API_KEY is required when LLM_PROVIDER=google and LLM_ENABLE_LIVE_CALLS=true");
    }
    if (env.LLM_PROVIDER === "openai" && !env.OPENAI_API_KEY?.trim()) {
      throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai and LLM_ENABLE_LIVE_CALLS=true");
    }
    if (env.LLM_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY?.trim()) {
      throw new Error(
        "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic and LLM_ENABLE_LIVE_CALLS=true",
      );
    }
  }

  return env;
}

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
