import { z } from "zod";

/** Evidence tools the planner may select for GL tagging. */
export const evidenceToolSchema = z.enum([
  "vendor_rules",
  "similar_transactions",
  "policy_context",
  "invoice_match",
]);

export type EvidenceTool = z.infer<typeof evidenceToolSchema>;

/** Structured output from the evidence planner LLM call. */
export const evidencePlanSchema = z.object({
  tools: z.array(evidenceToolSchema).min(1).max(4),
  rationale: z.string().max(500),
});

export type EvidencePlanOutput = z.infer<typeof evidencePlanSchema>;
