import { createHash } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { z } from "zod";

import type { AppEnv } from "@/lib/config/env";
import { estimateCostUsd, estimateEmbeddingCostUsd } from "@/lib/llm/pricing";

export interface LlmStructuredRequest {
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodTypeAny;
  promptVersion: string;
}

export interface LlmCallResult<T> {
  data: T;
  provider: AppEnv["LLM_PROVIDER"];
  model: string;
  promptVersion: string;
  promptHash: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
}

export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/**
 * Creates an LLM client configured for the active provider (Google default).
 *
 * @param env - Validated application environment.
 * @returns Provider-aware LLM client with structured JSON and embedding helpers.
 */
export function createLlmClient(env: AppEnv) {
  const googleClient =
    env.LLM_PROVIDER === "google" && env.GOOGLE_API_KEY
      ? new GoogleGenerativeAI(env.GOOGLE_API_KEY)
      : null;

  const openaiClient =
    env.LLM_PROVIDER === "openai" && env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
      : null;

  /**
   * Calls the configured LLM and parses JSON output through a Zod schema.
   *
   * @param request - Prompts, schema, and prompt version metadata.
   * @returns Parsed structured output with token and cost metadata.
   * @throws LlmUnavailableError when live calls are disabled or provider fails after retries.
   * @throws ZodError when model output does not match schema.
   */
  async function generateStructuredJson<T>(
    request: LlmStructuredRequest,
  ): Promise<LlmCallResult<T>> {
    if (!env.LLM_ENABLE_LIVE_CALLS) {
      throw new LlmUnavailableError("LLM_ENABLE_LIVE_CALLS=false");
    }

    const startedAt = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= env.LLM_MAX_RETRIES; attempt += 1) {
      try {
        if (env.LLM_PROVIDER === "google" && googleClient) {
          return await callGoogleStructured<T>(googleClient, env, request, startedAt);
        }
        if (env.LLM_PROVIDER === "openai" && openaiClient) {
          return await callOpenAiStructured<T>(openaiClient, env, request, startedAt);
        }
        throw new LlmUnavailableError(`Unsupported LLM_PROVIDER: ${env.LLM_PROVIDER}`);
      } catch (error) {
        lastError = error;
        const isRateLimit =
          error instanceof Error &&
          (error.message.includes("429") || error.message.toLowerCase().includes("rate"));
        if (!isRateLimit || attempt >= env.LLM_MAX_RETRIES) {
          break;
        }
        const backoffMs = Math.min(1000 * 2 ** attempt, 8000);
        await sleep(backoffMs);
      }
    }

    throw new LlmUnavailableError(
      lastError instanceof Error ? lastError.message : "LLM provider request failed",
    );
  }

  /**
   * Generates a text embedding vector using the configured provider.
   *
   * @param text - Input text to embed.
   * @returns Numeric embedding vector.
   * @throws LlmUnavailableError when embedding provider is not configured.
   */
  async function embedText(text: string): Promise<number[]> {
    if (!env.LLM_ENABLE_LIVE_CALLS) {
      throw new LlmUnavailableError("LLM_ENABLE_LIVE_CALLS=false");
    }

    if (env.LLM_PROVIDER === "google" && env.GOOGLE_API_KEY) {
      return embedGoogleText(env, text);
    }

    if (env.LLM_PROVIDER === "openai" && openaiClient) {
      const response = await openaiClient.embeddings.create({
        model: env.EMBEDDING_MODEL,
        input: text,
      });
      const vector = response.data[0]?.embedding;
      if (!vector?.length) {
        throw new LlmUnavailableError("OpenAI embedding returned empty vector");
      }
      return vector;
    }

    throw new LlmUnavailableError(`Embeddings not supported for provider: ${env.LLM_PROVIDER}`);
  }

  return { generateStructuredJson, embedText, estimateEmbeddingCostUsd };
}

async function callGoogleStructured<T>(
  client: GoogleGenerativeAI,
  env: AppEnv,
  request: LlmStructuredRequest,
  startedAt: number,
): Promise<LlmCallResult<T>> {
  const model = client.getGenerativeModel({
    model: env.LLM_MODEL,
    systemInstruction: request.systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const response = await model.generateContent(request.userPrompt);
  const rawText = response.response.text();
  const parsedJson = JSON.parse(rawText) as unknown;
  const data = request.schema.parse(parsedJson) as T;

  const usage = response.response.usageMetadata;
  const promptTokens = usage?.promptTokenCount ?? 0;
  const completionTokens = usage?.candidatesTokenCount ?? 0;

  return {
    data,
    provider: "google",
    model: env.LLM_MODEL,
    promptVersion: request.promptVersion,
    promptHash: hashPrompt(request.systemPrompt, request.userPrompt),
    promptTokens,
    completionTokens,
    costUsd: estimateCostUsd("google", env.LLM_MODEL, { promptTokens, completionTokens }),
    latencyMs: Date.now() - startedAt,
  };
}

async function callOpenAiStructured<T>(
  client: OpenAI,
  env: AppEnv,
  request: LlmStructuredRequest,
  startedAt: number,
): Promise<LlmCallResult<T>> {
  const response = await client.chat.completions.create({
    model: env.LLM_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt },
    ],
  });

  const rawText = response.choices[0]?.message?.content;
  if (!rawText) {
    throw new LlmUnavailableError("OpenAI returned empty completion");
  }

  const parsedJson = JSON.parse(rawText) as unknown;
  const data = request.schema.parse(parsedJson) as T;
  const promptTokens = response.usage?.prompt_tokens ?? 0;
  const completionTokens = response.usage?.completion_tokens ?? 0;

  return {
    data,
    provider: "openai",
    model: env.LLM_MODEL,
    promptVersion: request.promptVersion,
    promptHash: hashPrompt(request.systemPrompt, request.userPrompt),
    promptTokens,
    completionTokens,
    costUsd: estimateCostUsd("openai", env.LLM_MODEL, { promptTokens, completionTokens }),
    latencyMs: Date.now() - startedAt,
  };
}

interface GoogleEmbedContentResponse {
  embedding?: { values?: number[] };
  error?: { message?: string };
}

/**
 * Embeds text via Gemini API with output dimensionality matching pgvector schema.
 *
 * @param env - Application environment (must include GOOGLE_API_KEY).
 * @param text - Input text.
 * @returns Embedding vector of length env.EMBEDDING_DIMENSIONS.
 * @throws LlmUnavailableError when the API returns an error or empty vector.
 */
async function embedGoogleText(env: AppEnv, text: string): Promise<number[]> {
  const apiKey = env.GOOGLE_API_KEY;
  if (!apiKey?.trim()) {
    throw new LlmUnavailableError("GOOGLE_API_KEY is not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: env.EMBEDDING_DIMENSIONS,
    }),
  });

  const payload = (await response.json()) as GoogleEmbedContentResponse;
  if (!response.ok) {
    throw new LlmUnavailableError(
      payload.error?.message ?? `Google embedding HTTP ${response.status}`,
    );
  }

  const values = payload.embedding?.values;
  if (!values?.length) {
    throw new LlmUnavailableError("Google embedding returned empty vector");
  }

  if (values.length === env.EMBEDDING_DIMENSIONS) {
    return values;
  }

  return truncateAndNormalizeEmbedding(values, env.EMBEDDING_DIMENSIONS);
}

/**
 * Truncates a Matryoshka embedding to the target size and re-normalizes.
 *
 * @param vector - Source embedding (typically 3072-d from gemini-embedding-001).
 * @param dimensions - Target dimension count (e.g. 768 for pgvector column).
 * @returns Unit-length vector of length dimensions.
 */
function truncateAndNormalizeEmbedding(vector: number[], dimensions: number): number[] {
  const truncated = vector.slice(0, dimensions);
  const magnitude = Math.sqrt(truncated.reduce((sum, value) => sum + value * value, 0)) || 1;
  return truncated.map((value) => value / magnitude);
}

function hashPrompt(systemPrompt: string, userPrompt: string): string {
  return createHash("sha256").update(`${systemPrompt}\n---\n${userPrompt}`).digest("hex").slice(0, 16);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
