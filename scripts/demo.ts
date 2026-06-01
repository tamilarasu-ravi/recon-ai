import { config as loadDotenv } from "dotenv";

import { createDb } from "@/lib/db/client";
import { applyTransactionOverride } from "@/lib/orchestrator/apply-override";
import { getTenantIdBySlug, runApPipeline } from "@/lib/orchestrator/run-ap-pipeline";
import { reprocessTransactionTagging } from "@/lib/orchestrator/reprocess-tagging";
import { runTaggingPipeline } from "@/lib/orchestrator/run-pipeline";
import { receipts } from "@/lib/db/schema";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const DEMO_TIMESTAMP = "2026-06-01T12:00:00.000Z";

/**
 * Prints a labeled demo step to stdout.
 *
 * @param label - Step title.
 * @param detail - JSON-serializable detail object.
 */
function logStep(label: string, detail: unknown): void {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(detail, null, 2));
}

/**
 * Runs the capstone E2E demo: policy → tag → receipt → override → AP duplicate.
 *
 * @returns Promise that resolves when all steps succeed.
 * @throws Error when any demo assertion fails.
 */
async function main(): Promise<void> {
  const db = createDb();
  const tenantId = await getTenantIdBySlug(db, "tenant-a");

  console.log("ReconAI E2E demo (tenant-a)");
  console.log(`tenant_id: ${tenantId}`);

  const slackResult = await runTaggingPipeline(db, {
    tenantId,
    externalTransactionId: "demo-slack-55",
    transactionTimestamp: DEMO_TIMESTAMP,
    amount: "55.00",
    currency: "USD",
    vendorRaw: "Slack",
  });
  logStep("1. Tagging — Slack $55 (under receipt threshold)", slackResult);
  if (slackResult.decision !== "AUTO_TAG") {
    throw new Error(`Expected AUTO_TAG for Slack $55, got ${slackResult.decision}`);
  }

  const awsReceiptResult = await runTaggingPipeline(db, {
    tenantId,
    externalTransactionId: "demo-aws-99",
    transactionTimestamp: DEMO_TIMESTAMP,
    amount: "99.00",
    currency: "USD",
    vendorRaw: "AWS",
    memo: "ec2",
  });
  logStep("2. Policy + tagging — AWS $99 (receipt required)", awsReceiptResult);
  if (awsReceiptResult.policyOutcome !== "FLAG_RECEIPT") {
    throw new Error(`Expected FLAG_RECEIPT, got ${awsReceiptResult.policyOutcome}`);
  }
  if (awsReceiptResult.decision !== "QUEUE_REVIEW") {
    throw new Error(`Expected QUEUE_REVIEW before receipt, got ${awsReceiptResult.decision}`);
  }

  await db.insert(receipts).values({
    tenantId,
    transactionId: awsReceiptResult.transactionId,
    receiptText: "Demo receipt: AWS invoice #DEMO-99",
    clearedAt: new Date(),
  });

  const awsRetag = await reprocessTransactionTagging(
    db,
    tenantId,
    awsReceiptResult.transactionId,
  );
  logStep("3. Receipt cleared → reprocess tagging", awsRetag);
  if (awsRetag.decision !== "AUTO_TAG") {
    throw new Error(`Expected AUTO_TAG after receipt, got ${awsRetag.decision}`);
  }

  const zephyrFirst = await runTaggingPipeline(db, {
    tenantId,
    externalTransactionId: "demo-zephyr-1",
    transactionTimestamp: DEMO_TIMESTAMP,
    amount: "1200.00",
    currency: "USD",
    vendorRaw: "Zephyr Labs LLC",
    memo: "consulting",
  });
  logStep("4. New vendor — Zephyr (before override)", zephyrFirst);

  const override = await applyTransactionOverride(db, {
    tenantId,
    transactionId: zephyrFirst.transactionId,
    glCode: "6200",
  });
  logStep("5. Accountant override → vendor rule", override);

  const zephyrReplay = await runTaggingPipeline(db, {
    tenantId,
    externalTransactionId: "demo-zephyr-2",
    transactionTimestamp: DEMO_TIMESTAMP,
    amount: "50.00",
    currency: "USD",
    vendorRaw: "Zephyr Labs LLC",
    memo: "follow-on consulting",
  });
  logStep("6. Replay similar vendor (learning loop)", zephyrReplay);
  if (zephyrReplay.decision !== "AUTO_TAG") {
    throw new Error(`Expected AUTO_TAG after override learning, got ${zephyrReplay.decision}`);
  }

  const apFirst = await runApPipeline(db, {
    tenantId,
    externalInvoiceId: "demo-inv-unique",
    vendorRaw: "aws",
    amount: "500.00",
    currency: "USD",
    invoiceDate: "2026-05-15T00:00:00.000Z",
  });
  logStep("7. AP recommend-only", apFirst);
  if (apFirst.recommendationStatus !== "recommend") {
    throw new Error("Expected AP recommendation");
  }

  const apDup = await runApPipeline(db, {
    tenantId,
    externalInvoiceId: "demo-inv-dup-attempt",
    vendorRaw: "AWS",
    amount: "500.00",
    currency: "USD",
    invoiceDate: "2026-05-15T00:00:00.000Z",
  });
  logStep("8. AP duplicate refused", apDup);
  if (apDup.status !== "duplicate") {
    throw new Error("Expected duplicate invoice refusal");
  }

  console.log("\n✅ Demo complete — all steps passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
