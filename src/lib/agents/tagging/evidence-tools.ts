import { and, eq, ilike } from "drizzle-orm";

import type { PolicyOutcome } from "@/lib/agents/policy/types";
import type { AppEnv } from "@/lib/config/env";
import type { EvidencePlan } from "@/lib/agents/tagging/evidence-planner";
import type { EvidenceTool } from "@/lib/llm/schemas/evidence-planner";
import type { DbClient } from "@/lib/db/client";
import { invoices } from "@/lib/db/schema";

const INVOICE_MATCH_LIMIT = 3;

export interface EvidenceToolContext {
  tenantId: string;
  vendorRaw: string;
  vendorId: string | null;
  ruleHit: boolean;
  ruleGlAccountId?: string;
  policyOutcome: PolicyOutcome;
  policyVersion?: string;
  matchedPolicyRules: Array<{ ruleType: string; reason: string }>;
  receiptBlocked: boolean;
}

export interface EvidenceToolResult {
  tool: EvidenceTool;
  status: "complete" | "skipped" | "error";
  detail: Record<string, unknown>;
}

export interface EvidenceToolExecution {
  results: EvidenceToolResult[];
  policyContextSummary: string | null;
  invoiceMatchSummary: string | null;
}

/**
 * Summarizes policy evaluation for LLM tagging context.
 *
 * @param ctx - Policy fields from graph state.
 * @returns Human-readable policy summary string.
 */
export function buildPolicyContextSummary(ctx: EvidenceToolContext): string {
  const matched =
    ctx.matchedPolicyRules.length > 0
      ? ctx.matchedPolicyRules.map((rule) => `${rule.ruleType}: ${rule.reason}`).join("; ")
      : "(no rules matched)";

  return [
    `outcome=${ctx.policyOutcome}`,
    ctx.policyVersion ? `policy_version=${ctx.policyVersion}` : null,
    `receipt_blocked=${ctx.receiptBlocked}`,
    `matched_rules=${matched}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * Executes non-retrieval evidence tools from the planner output.
 *
 * @param db - Database client.
 * @param plan - Final evidence plan.
 * @param ctx - Transaction and policy context.
 * @returns Per-tool results and summaries for the tagging LLM.
 */
export async function executeEvidenceTools(
  db: DbClient,
  _env: AppEnv,
  plan: EvidencePlan,
  ctx: EvidenceToolContext,
): Promise<EvidenceToolExecution> {
  const results: EvidenceToolResult[] = [];
  let policyContextSummary: string | null = null;
  let invoiceMatchSummary: string | null = null;

  for (const tool of plan.tools) {
    if (tool === "vendor_rules") {
      results.push({
        tool,
        status: ctx.ruleHit ? "complete" : "skipped",
        detail: {
          rule_hit: ctx.ruleHit,
          gl_account_id: ctx.ruleGlAccountId ?? null,
          vendor_id: ctx.vendorId,
        },
      });
      continue;
    }

    if (tool === "similar_transactions") {
      results.push({
        tool,
        status: "complete",
        detail: { delegated_to: "run-tagging-agent retrieval block" },
      });
      continue;
    }

    if (tool === "policy_context") {
      policyContextSummary = buildPolicyContextSummary(ctx);
      results.push({
        tool,
        status: "complete",
        detail: { summary: policyContextSummary },
      });
      continue;
    }

    if (tool === "invoice_match") {
      try {
        const rows = await db
          .select({
            externalInvoiceId: invoices.externalInvoiceId,
            amount: invoices.amount,
            currency: invoices.currency,
            invoiceDate: invoices.invoiceDate,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.tenantId, ctx.tenantId),
              ilike(invoices.vendorRaw, `%${ctx.vendorRaw.trim()}%`),
            ),
          )
          .limit(INVOICE_MATCH_LIMIT);

        invoiceMatchSummary =
          rows.length > 0
            ? rows
                .map(
                  (row) =>
                    `${row.externalInvoiceId} ${row.amount} ${row.currency} @ ${row.invoiceDate.toISOString().slice(0, 10)}`,
                )
                .join("; ")
            : "(no matching invoices)";

        results.push({
          tool,
          status: rows.length > 0 ? "complete" : "skipped",
          detail: { match_count: rows.length, summary: invoiceMatchSummary },
        });
      } catch (error) {
        results.push({
          tool,
          status: "error",
          detail: {
            error: error instanceof Error ? error.message : "invoice_match_failed",
          },
        });
      }
    }
  }

  return { results, policyContextSummary, invoiceMatchSummary };
}
