import { Langfuse } from "langfuse";

import type { AppendAuditInput } from "@/lib/audit/writers";

let langfuseClient: Langfuse | null = null;
let langfuseChecked = false;

/**
 * Returns true when Langfuse public and secret keys are configured.
 *
 * @returns Whether Langfuse export is active.
 */
export function isLangfuseEnabled(): boolean {
  return getLangfuseClient() !== null;
}

/**
 * Lazily constructs a singleton Langfuse client when credentials exist.
 *
 * @returns Langfuse client or null when disabled.
 */
function getLangfuseClient(): Langfuse | null {
  if (langfuseChecked) {
    return langfuseClient;
  }
  langfuseChecked = true;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  if (!publicKey || !secretKey) {
    return null;
  }

  langfuseClient = new Langfuse({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_HOST?.trim() ?? "https://cloud.langfuse.com",
  });

  return langfuseClient;
}

/**
 * Mirrors an audit_log row to Langfuse using run_id as trace id (optional observability).
 *
 * @param input - Same payload written to audit_log.
 * @returns Promise that resolves when flush completes.
 */
export async function exportAuditToLangfuse(input: AppendAuditInput): Promise<void> {
  const client = getLangfuseClient();
  if (!client) {
    return;
  }

  const observability = input.observability;
  const costUsd =
    typeof observability.cost_usd === "number" ? observability.cost_usd : undefined;
  const model = typeof observability.model === "string" ? observability.model : undefined;
  const promptTokens =
    typeof observability.prompt_tokens === "number" ? observability.prompt_tokens : undefined;
  const completionTokens =
    typeof observability.completion_tokens === "number"
      ? observability.completion_tokens
      : undefined;

  const trace = client.trace({
    id: input.runId,
    name: `${input.agent}-run`,
    metadata: {
      tenant_id: input.tenantId,
      transaction_id: input.transactionId,
      invoice_id: input.invoiceId,
      agent: input.agent,
      decision: input.decision,
      confidence: input.confidence,
      policy_version: input.policyVersion,
    },
    input: {
      agent: input.agent,
      policy_version: input.policyVersion,
    },
    output: {
      decision: input.decision,
      observability,
    },
  });

  if (model !== undefined || costUsd !== undefined || promptTokens !== undefined) {
    trace.generation({
      name: `${input.agent}_llm`,
      model: model ?? "fixture",
      usage:
        promptTokens !== undefined || completionTokens !== undefined
          ? {
              input: promptTokens,
              output: completionTokens,
            }
          : undefined,
      metadata: {
        cost_usd: costUsd,
        prompt_version: observability.prompt_version,
        llm_skipped: observability.llm_skipped,
        llm_skipped_reason: observability.llm_skipped_reason,
      },
    });
  }

  await client.flushAsync();
}

/**
 * Schedules Langfuse export without blocking the orchestrator hot path.
 *
 * @param input - Audit log payload.
 */
export function scheduleLangfuseExport(input: AppendAuditInput): void {
  void exportAuditToLangfuse(input).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Langfuse export failed";
    console.error(`[langfuse] ${message}`);
  });
}
