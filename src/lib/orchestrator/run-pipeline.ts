import { and, eq } from "drizzle-orm";

import { evaluateTransactionPolicy } from "@/lib/agents/policy/evaluator";
import type { PolicyOutcome } from "@/lib/agents/policy/types";
import { isReceiptRequiredAndNotCleared } from "@/lib/agents/policy/receipt-status";
import { runTaggingAgent } from "@/lib/agents/tagging/run-tagging-agent";
import type { DbClient } from "@/lib/db/client";
import { appendAuditLog, appendEvent } from "@/lib/audit/writers";
import { deriveIdempotencyKey, loadEnv, newRunId } from "@/lib/config/env";
import { reviewQueue, transactions } from "@/lib/db/schema";
import type { TaggingDecision } from "@/lib/orchestrator/gates";

export interface TransactionCreatedInput {
  tenantId: string;
  externalTransactionId: string;
  transactionTimestamp: string;
  amount: string;
  currency: string;
  vendorRaw: string;
  memo?: string;
  mcc?: string;
}

export interface PipelineOptions {
  /** When true, skips policy evaluation (tagging eval harness only). */
  skipPolicy?: boolean;
}

export interface PipelineResult {
  runId: string;
  transactionId: string;
  status: "accepted" | "duplicate";
  policyOutcome?: PolicyOutcome;
  policyVersion?: string;
  decision?: TaggingDecision;
  confidence?: number;
  suggestedGlAccountId?: string | null;
}

/**
 * Downgrades AUTO_TAG when policy outcome requires human review before posting.
 *
 * @param decision - Tagging agent decision.
 * @param policyOutcome - Policy evaluation outcome.
 * @returns Final decision after policy cap.
 */
function applyPolicyDecisionCap(
  decision: TaggingDecision,
  policyOutcome: PolicyOutcome,
): TaggingDecision {
  if (decision === "AUTO_TAG" && policyOutcome === "FLAG_REVIEW") {
    return "QUEUE_REVIEW";
  }
  return decision;
}

/**
 * Runs the full transaction ingest and tagging pipeline for one transaction.
 *
 * @param db - Drizzle database client.
 * @param input - Sanitized transaction ingest payload.
 * @returns Run metadata including policy and tri-state tagging decision.
 * @throws Error when database insert fails unexpectedly.
 */
export async function runTaggingPipeline(
  db: DbClient,
  input: TransactionCreatedInput,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const runId = newRunId();
  const env = loadEnv();
  const idempotencyKey = deriveIdempotencyKey(
    input.tenantId,
    input.externalTransactionId,
    input.transactionTimestamp,
  );

  const existingRows = await db
    .select({
      id: transactions.id,
      taggingDecision: transactions.taggingDecision,
      confidence: transactions.confidence,
      suggestedGlAccountId: transactions.suggestedGlAccountId,
    })
    .from(transactions)
    .where(
      and(eq(transactions.tenantId, input.tenantId), eq(transactions.idempotencyKey, idempotencyKey)),
    )
    .limit(1);

  const existing = existingRows[0];

  if (existing) {
    return {
      runId,
      transactionId: existing.id,
      status: "duplicate",
      decision: existing.taggingDecision ?? undefined,
      confidence: existing.confidence ? Number(existing.confidence) : undefined,
      suggestedGlAccountId: existing.suggestedGlAccountId,
    };
  }

  const [transaction] = await db
    .insert(transactions)
    .values({
      tenantId: input.tenantId,
      externalTransactionId: input.externalTransactionId,
      idempotencyKey,
      transactionTimestamp: new Date(input.transactionTimestamp),
      amount: input.amount,
      currency: input.currency,
      vendorRaw: input.vendorRaw,
      memo: input.memo,
      mcc: input.mcc,
      processingStatus: "processing",
    })
    .returning({ id: transactions.id });

  await appendEvent(db, {
    tenantId: input.tenantId,
    eventType: "TransactionCreated",
    runId,
    payload: {
      transaction_id: transaction.id,
      external_transaction_id: input.externalTransactionId,
      vendor_raw: input.vendorRaw,
    },
  });

  const policyResult = options?.skipPolicy
    ? {
        outcome: "ALLOW" as const,
        policyVersion: "eval-skip",
        policyId: "00000000-0000-0000-0000-000000000000",
        matchedRules: [],
      }
    : await evaluateTransactionPolicy(db, input.tenantId, {
        amount: input.amount,
        currency: input.currency,
        mcc: input.mcc,
      });

  if (!options?.skipPolicy) {
    await appendEvent(db, {
      tenantId: input.tenantId,
      eventType: "PolicyEvaluated",
      runId,
      payload: {
        transaction_id: transaction.id,
        policy_version: policyResult.policyVersion,
        outcome: policyResult.outcome,
        matched_rules: policyResult.matchedRules,
      },
    });

    await appendAuditLog(db, {
      tenantId: input.tenantId,
      runId,
      agent: "policy",
      transactionId: transaction.id,
      policyVersion: policyResult.policyVersion,
      observability: {
        outcome: policyResult.outcome,
        matched_rules: policyResult.matchedRules,
      },
    });
  }

  const receiptBlocked = options?.skipPolicy
    ? false
    : await isReceiptRequiredAndNotCleared(
        db,
        input.tenantId,
        transaction.id,
        policyResult.outcome,
      );

  const taggingResult = await runTaggingAgent(db, env, {
    tenantId: input.tenantId,
    transactionId: transaction.id,
    vendorRaw: input.vendorRaw,
    memo: input.memo,
    amount: input.amount,
    currency: input.currency,
    mcc: input.mcc,
    receiptRequiredAndNotCleared: receiptBlocked,
  });

  const finalDecision = applyPolicyDecisionCap(taggingResult.decision, policyResult.outcome);
  const finalReason =
    finalDecision !== taggingResult.decision ? "policy_flag_review" : taggingResult.reason;

  if (finalDecision !== taggingResult.decision) {
    await db
      .update(transactions)
      .set({
        taggingDecision: finalDecision,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transaction.id));
  }

  await appendEvent(db, {
    tenantId: input.tenantId,
    eventType: "TransactionTagged",
    runId,
    payload: {
      transaction_id: transaction.id,
      decision: finalDecision,
      confidence: taggingResult.confidence,
      gl_account_id: finalDecision === "AUTO_TAG" ? taggingResult.suggestedGlAccountId : undefined,
      reason: finalReason,
      policy_version: policyResult.policyVersion,
    },
  });

  if (finalDecision === "QUEUE_REVIEW" || finalDecision === "REFUSE") {
    await db.insert(reviewQueue).values({
      tenantId: input.tenantId,
      transactionId: transaction.id,
      reason: finalReason,
      status: "open",
      runId,
    });
  }

  await appendAuditLog(db, {
    tenantId: input.tenantId,
    runId,
    agent: "tagging",
    transactionId: transaction.id,
    decision: finalDecision,
    confidence: taggingResult.confidence,
    policyVersion: policyResult.policyVersion,
    observability: {
      steps: taggingResult.steps,
      llm_skipped: taggingResult.llmSkipped,
      llm_skipped_reason: taggingResult.llmSkippedReason,
      suggested_gl_account_id: taggingResult.suggestedGlAccountId,
      reason: finalReason,
      receipt_blocked: receiptBlocked,
      policy_outcome: policyResult.outcome,
    },
  });

  await db
    .update(transactions)
    .set({ processingStatus: "completed", updatedAt: new Date() })
    .where(eq(transactions.id, transaction.id));

  return {
    runId,
    transactionId: transaction.id,
    status: "accepted",
    policyOutcome: policyResult.outcome,
    policyVersion: policyResult.policyVersion,
    decision: finalDecision,
    confidence: taggingResult.confidence,
    suggestedGlAccountId: taggingResult.suggestedGlAccountId,
  };
}
