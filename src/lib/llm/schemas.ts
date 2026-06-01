import { z } from "zod";

/**
 * Zod schema for structured tagging output from the LLM.
 * All GL proposals must pass CoA allow-list validation separately.
 */
export const taggingSuggestionSchema = z.object({
  gl_account_id: z.string().uuid(),
  tax_code: z.string().min(1).max(32).optional(),
  dimensions: z.record(z.string()).optional(),
  rationale: z.string().min(1).max(2000),
});

export type TaggingSuggestion = z.infer<typeof taggingSuggestionSchema>;
