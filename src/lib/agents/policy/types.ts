import { z } from "zod";

export const policyOutcomeSchema = z.enum(["ALLOW", "FLAG_RECEIPT", "FLAG_REVIEW"]);
export type PolicyOutcome = z.infer<typeof policyOutcomeSchema>;

export const receiptRequiredRuleConfigSchema = z.object({
  min_amount: z.number().positive(),
});

export const bannedMccRuleConfigSchema = z.object({
  mccs: z.array(z.string().min(1)).min(1),
});

export const singleTransactionCapRuleConfigSchema = z.object({
  max_amount: z.number().positive(),
});

export const policyRuleConfigByType = {
  receipt_required: receiptRequiredRuleConfigSchema,
  banned_mcc: bannedMccRuleConfigSchema,
  single_transaction_cap: singleTransactionCapRuleConfigSchema,
} as const;

export type PolicyRuleType = keyof typeof policyRuleConfigByType;

export interface PolicyRuleRow {
  ruleType: PolicyRuleType;
  ruleConfig: unknown;
}

export interface PolicyEvaluationInput {
  amount: string;
  currency: string;
  mcc?: string;
}

export interface PolicyEvaluationResult {
  outcome: PolicyOutcome;
  policyVersion: string;
  policyId: string;
  matchedRules: Array<{ ruleType: PolicyRuleType; reason: string }>;
}
