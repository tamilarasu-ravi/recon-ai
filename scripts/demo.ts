import { createHash, randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";

import { createDb, closeDb } from "@/lib/db/client";
import { applyTransactionOverride } from "@/lib/orchestrator/apply-override";
import { getTenantIdBySlug, runApPipeline } from "@/lib/orchestrator/run-ap-pipeline";
import { reprocessTransactionTagging } from "@/lib/orchestrator/reprocess-tagging";
import { runTaggingPipeline } from "@/lib/orchestrator/run-pipeline";
import { receipts } from "@/lib/db/schema";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const DEMO_TIMESTAMP = "2026-06-01T12:00:00.000Z";

/**
 * Builds a unique external id per demo run so repeat invocations do not hit idempotency duplicates.
 *
 * @param runId - Unique run suffix for this demo execution.
 * @param slug - Stable step slug (e.g. slack-55).
 * @returns External transaction or invoice id.
 */
function demoExternalId(runId: string, slug: string): string {
  return `demo-${runId}-${slug}`;
}

/**
 * Derives a stable but high-entropy invoice date per demo run (AP duplicate hash uses date).
 *
 * @param runId - Unique demo run suffix.
 * @returns ISO timestamp at UTC midnight.
 */
function demoApInvoiceDate(runId: string): string {
  const offset =
    parseInt(createHash("sha256").update(`ap-invoice-${runId}`).digest("hex").slice(0, 8), 16) %
    365;
  const date = new Date(Date.UTC(2026, 0, 1 + offset));
  return date.toISOString();
}

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
  const demoRunId = randomUUID().slice(0, 8);

  console.log("ReconAI E2E demo (tenant-a)");
  console.log(`tenant_id: ${tenantId}`);
  console.log(`demo_run_id: ${demoRunId} (fresh external ids — safe to re-run)`);

  const slackResult = await runTaggingPipeline(db, {
    tenantId,
    externalTransactionId: demoExternalId(demoRunId, "slack-55"),
    transactionTimestamp: DEMO_TIMESTAMP,
    amount: "55.00",
    currency: "USD",
    vendorRaw: "Slack",
  });
  logStep("1. Tagging — Slack $55 (under receipt threshold)", slackResult);
  if (slackResult.status === "duplicate") {
    throw new Error("Unexpected duplicate on step 1 — demo_run_id should be unique");
  }
  if (slackResult.decision !== "AUTO_TAG") {
    throw new Error(`Expected AUTO_TAG for Slack $55, got ${slackResult.decision}`);
  }

  const awsReceiptResult = await runTaggingPipeline(db, {
    tenantId,
    externalTransactionId: demoExternalId(demoRunId, "aws-99"),
    transactionTimestamp: DEMO_TIMESTAMP,
    amount: "99.00",
    currency: "USD",
    vendorRaw: "AWS",
    memo: "ec2",
  });
  logStep("2. Policy + tagging — AWS $99 (receipt required)", awsReceiptResult);
  if (awsReceiptResult.status === "duplicate") {
    throw new Error("Unexpected duplicate on step 2 — demo_run_id should be unique");
  }
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
    externalTransactionId: demoExternalId(demoRunId, "zephyr-1"),
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
    externalTransactionId: demoExternalId(demoRunId, "zephyr-2"),
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

  const apInvoiceDate = demoApInvoiceDate(demoRunId);

  const apFirst = await runApPipeline(db, {
    tenantId,
    externalInvoiceId: demoExternalId(demoRunId, "inv-unique"),
    vendorRaw: "aws",
    amount: "500.00",
    currency: "USD",
    invoiceDate: apInvoiceDate,
  });
  logStep("7. AP recommend-only", apFirst);
  if (apFirst.status === "duplicate") {
    throw new Error(
      `Unexpected AP duplicate on step 7 (collides with prior demo invoice for ${apInvoiceDate})`,
    );
  }
  if (apFirst.recommendationStatus !== "recommend") {
    throw new Error("Expected AP recommendation");
  }

  const apDup = await runApPipeline(db, {
    tenantId,
    externalInvoiceId: demoExternalId(demoRunId, "inv-dup-attempt"),
    vendorRaw: "AWS",
    amount: "500.00",
    currency: "USD",
    invoiceDate: apInvoiceDate,
  });
  logStep("8. AP duplicate refused", apDup);
  if (apDup.status !== "duplicate") {
    throw new Error("Expected duplicate invoice refusal");
  }

  const tenantBId = await getTenantIdBySlug(db, "tenant-b");
  const refuseResult = await runTaggingPipeline(db, {
    tenantId: tenantBId,
    externalTransactionId: demoExternalId(demoRunId, "refuse-courier"),
    transactionTimestamp: DEMO_TIMESTAMP,
    amount: "60.00",
    currency: "USD",
    vendorRaw: "Unknown Courier 42",
    memo: "showcase refuse path",
  });
  logStep("9. REFUSE — unknown vendor (tenant-b)", refuseResult);
  if (refuseResult.status === "duplicate") {
    throw new Error("Unexpected duplicate on REFUSE step");
  }
  if (refuseResult.decision !== "REFUSE") {
    throw new Error(`Expected REFUSE for unknown vendor, got ${refuseResult.decision}`);
  }

  console.log("\n✅ Demo complete — all steps passed (incl. REFUSE).");
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
