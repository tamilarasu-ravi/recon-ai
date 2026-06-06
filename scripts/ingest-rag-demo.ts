import { config as loadDotenv } from "dotenv";

import { getTenantIdBySlug } from "@/lib/orchestrator/run-ap-pipeline";
import { runTaggingPipeline } from "@/lib/orchestrator/run-pipeline";
import { getDb, getRootDb } from "@/lib/db/client";
import { runWithRlsBypass } from "@/lib/db/tenant-rls";
import { runCliScript } from "./lib/close-cli-resources.js";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const DEMO_TIMESTAMP = new Date().toISOString();

/**
 * Ingests one tenant-a transaction designed to hit RAG retrieval in the pipeline trace.
 *
 * @returns Promise that resolves when ingest completes.
 */
async function main(): Promise<void> {
  getRootDb();

  await runWithRlsBypass(async () => {
    const db = getDb();
    const tenantId = await getTenantIdBySlug(db, "tenant-a");
    const externalId = `rag-demo-${Date.now()}`;

    const result = await runTaggingPipeline(
      db,
      {
        tenantId,
        externalTransactionId: externalId,
        transactionTimestamp: DEMO_TIMESTAMP,
        amount: "125.00",
        currency: "USD",
        vendorRaw: "EC2 Hosting Services",
        memo: "ec2 hosting",
      },
      { skipHitl: true },
    );

    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
    const detailUrl = `${base}/transactions/${result.transactionId}?tenant_id=${tenantId}&run_id=${result.runId}`;
    const ingestUrl = `${base}/review-queue/new`;

    console.log("\nRAG demo transaction created (tenant-a / Acme Labs)\n");
    console.log(`  external_id:  ${externalId}`);
    console.log(`  transaction:  ${result.transactionId}`);
    console.log(`  run_id:       ${result.runId}`);
    console.log(`  decision:     ${result.decision ?? "—"}`);
    console.log(`  confidence:   ${result.confidence ?? "—"}`);
    console.log("\nOpen in UI:\n");
    console.log(`  ${detailUrl}`);
    console.log("\nOr ingest another via preset at:\n");
    console.log(`  ${ingestUrl}`);
    console.log('  → Preset: "RAG demo — EC2 hosting (no vendor rule)" · enable async for live stream\n');
  });
}

runCliScript(main);
