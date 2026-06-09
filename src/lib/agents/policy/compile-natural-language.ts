import { z } from "zod";

import { policyRuleConfigByType, type PolicyRuleType } from "@/lib/agents/policy/types";
import type { AppEnv } from "@/lib/config/env";
import { createPolicyRule } from "@/lib/data/policy-admin";
import type { DbClient } from "@/lib/db/client";
import { createLlmClient, LlmUnavailableError } from "@/lib/llm/client";
import {
  buildPolicyCompileUserPrompt,
  POLICY_COMPILE_PROMPT_VERSION,
  POLICY_COMPILE_SYSTEM_PROMPT,
} from "@/lib/llm/prompts/policy-compile";

const compiledPolicyRuleSchema = z.object({
  rule_type: z.enum(["receipt_required", "banned_mcc", "single_transaction_cap"]),
  rule_config: z.record(z.unknown()),
  summary: z.string().min(1).max(512),
});

export type CompiledPolicyRule = z.infer<typeof compiledPolicyRuleSchema>;

export interface CompilePolicyResult {
  compiled: CompiledPolicyRule;
  promptVersion: string;
  model: string;
  persisted?: {
    ruleId: string;
    ruleType: PolicyRuleType;
    ruleConfig: Record<string, unknown>;
  };
}

/**
 * Calls the LLM to translate natural language into one validated policy rule.
 *
 * @param env - Application environment.
 * @param naturalLanguage - Policy statement from admin UI.
 * @returns Compiled rule JSON (not yet persisted).
 * @throws LlmUnavailableError when live LLM calls are disabled.
 * @throws z.ZodError when model output or rule_config fails validation.
 */
export async function compilePolicyFromNaturalLanguage(
  env: AppEnv,
  naturalLanguage: string,
): Promise<CompilePolicyResult> {
  const trimmed = naturalLanguage.trim();
  if (trimmed.length < 8) {
    throw new Error("Policy statement is too short — describe the rule in one sentence.");
  }

  const llm = createLlmClient(env);
  const result = await llm.generateStructuredJson<CompiledPolicyRule>({
    systemPrompt: POLICY_COMPILE_SYSTEM_PROMPT,
    userPrompt: buildPolicyCompileUserPrompt(trimmed),
    schema: compiledPolicyRuleSchema,
    promptVersion: POLICY_COMPILE_PROMPT_VERSION,
  });

  const configSchema = policyRuleConfigByType[result.data.rule_type];
  const ruleConfig = configSchema.parse(result.data.rule_config);

  return {
    compiled: {
      rule_type: result.data.rule_type,
      rule_config: ruleConfig as Record<string, unknown>,
      summary: result.data.summary,
    },
    promptVersion: result.promptVersion,
    model: result.model,
  };
}

/**
 * Compiles NL policy text and optionally persists the rule on the active pack.
 *
 * @param db - Database client.
 * @param env - Application environment.
 * @param tenantId - Tenant UUID.
 * @param naturalLanguage - Policy statement.
 * @param persist - When true, inserts into policy_rules after validation.
 * @returns Compile metadata and optional persisted rule id.
 */
export async function compileAndOptionalPersistPolicy(
  db: DbClient,
  env: AppEnv,
  tenantId: string,
  naturalLanguage: string,
  persist: boolean,
): Promise<CompilePolicyResult> {
  let compileResult: CompilePolicyResult;

  try {
    compileResult = await compilePolicyFromNaturalLanguage(env, naturalLanguage);
  } catch (error) {
    if (error instanceof LlmUnavailableError) {
      throw new Error(
        "Policy compiler requires live LLM calls — set LLM_ENABLE_LIVE_CALLS=true and provider API key.",
      );
    }
    throw error;
  }

  if (!persist) {
    return compileResult;
  }

  const created = await createPolicyRule(db, {
    tenantId,
    ruleType: compileResult.compiled.rule_type,
    ruleConfig: compileResult.compiled.rule_config,
  });

  return {
    ...compileResult,
    persisted: {
      ruleId: created.rule.id,
      ruleType: created.rule.ruleType,
      ruleConfig: created.rule.ruleConfig,
      replaced: created.replaced,
    },
  };
}
