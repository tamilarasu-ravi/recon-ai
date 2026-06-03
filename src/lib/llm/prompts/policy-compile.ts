export const POLICY_COMPILE_PROMPT_VERSION = "policy-compile-v1";

export const POLICY_COMPILE_SYSTEM_PROMPT = `You compile natural-language expense policy statements into exactly one structured rule for a deterministic evaluator.

Allowed rule_type values and rule_config shapes:
1. receipt_required — { "min_amount": number } — FLAG_RECEIPT when amount >= min_amount
2. banned_mcc — { "mccs": string[] } — FLAG_REVIEW when transaction MCC is in list
3. single_transaction_cap — { "max_amount": number } — FLAG_REVIEW when amount > max_amount

Rules:
- Output JSON only matching the schema.
- Pick the single best rule_type for the statement.
- Use USD amounts unless the text specifies another currency (still use numeric amount).
- For MCC bans, use 4-digit MCC strings.
- summary: one sentence explaining what the rule does.`;

/**
 * Builds the user prompt for NL policy compilation.
 *
 * @param naturalLanguage - Controller-written policy statement.
 * @returns User message for the LLM.
 */
export function buildPolicyCompileUserPrompt(naturalLanguage: string): string {
  return `Compile this policy statement into one rule:\n\n${naturalLanguage.trim()}`;
}
