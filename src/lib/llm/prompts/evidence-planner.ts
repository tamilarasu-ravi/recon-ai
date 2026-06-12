export const EVIDENCE_PLANNER_PROMPT_VERSION = "evidence-planner-v1";

/**
 * Builds system prompt for the evidence planner LLM call.
 *
 * @returns System instruction string for tool selection.
 */
export function buildEvidencePlannerSystemPrompt(): string {
  return [
    "You are an evidence planner for corporate card GL tagging.",
    "Select which evidence tools to run before suggesting a GL account.",
    "Respond with JSON only matching the schema: tools (array) and rationale (string).",
    "Available tools:",
    "- vendor_rules: tenant vendor→GL rules (use when vendor is known)",
    "- similar_transactions: pgvector neighbors (use for new vendors or weak rules)",
    "- policy_context: spend policy flags (receipt, MCC, caps)",
    "- invoice_match: AP invoices for the same vendor (optional cross-check)",
    "Prefer fewer tools when a vendor rule already covers a known vendor with valid GL.",
  ].join(" ");
}

/**
 * Builds user prompt with transaction and policy context for evidence planning.
 *
 * @param params - Transaction fields and prior rule/policy signals.
 * @returns User prompt string for the planner LLM call.
 */
export function buildEvidencePlannerUserPrompt(params: {
  vendorRaw: string;
  memo?: string;
  amount: string;
  currency: string;
  isNewVendor: boolean;
  ruleHit: boolean;
  ruleGlAccountId?: string;
  labeledCorpusCount: number;
  policyOutcome: string;
  receiptBlocked: boolean;
}): string {
  return [
    "Transaction:",
    `vendor: ${params.vendorRaw}`,
    `amount: ${params.amount} ${params.currency}`,
    params.memo ? `memo: ${params.memo}` : "memo: (empty)",
    "",
    "Signals:",
    `is_new_vendor: ${params.isNewVendor}`,
    `rule_hit: ${params.ruleHit}`,
    params.ruleGlAccountId ? `rule_gl_account_id: ${params.ruleGlAccountId}` : "rule_gl_account_id: (none)",
    `labeled_corpus_count: ${params.labeledCorpusCount}`,
    `policy_outcome: ${params.policyOutcome}`,
    `receipt_blocked: ${params.receiptBlocked}`,
    "",
    "Examples:",
    "1) Known vendor, rule hit GL in CoA → tools: [vendor_rules] — skip similar_transactions.",
    "2) New vendor, no rule → tools: [vendor_rules, similar_transactions, policy_context].",
    "",
    'Return JSON: { "tools": ["vendor_rules", ...], "rationale": "..." }',
  ].join("\n");
}
