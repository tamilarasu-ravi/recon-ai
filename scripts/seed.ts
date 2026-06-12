import { config as loadDotenv } from "dotenv";
import { eq, sql } from "drizzle-orm";

import {
  buildDeterministicEmbedding,
  buildEmbeddingText,
  embedAndStoreTransaction,
} from "@/lib/agents/tagging/embed-transaction";
import { seedMockInvoicesForTenant } from "@/lib/agents/ap/seed-invoices";
import { seedTenantPolicyPack } from "@/lib/agents/policy/seed-policies";
import { seedApiKeyForTenant } from "@/lib/auth/seed-api-keys";
import { seedWebhookSecretForTenant } from "@/lib/auth/seed-webhook-secrets";
import { hasProviderApiKey, loadEnv } from "@/lib/config/env";
import { getDb, getRootDb } from "@/lib/db/client";
import { runWithRlsBypass } from "@/lib/db/tenant-rls";
import { runCliScript } from "./lib/close-cli-resources.js";
import { syncSeedVendorRulesForTenant, TENANT_SEED } from "./lib/tenant-seed-config.js";
import {
  chartOfAccounts,
  transactions,
  vendorAliases,
  vendors,
  tenants,
} from "@/lib/db/schema";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

/**
 * Upserts a deterministic embedding for a labeled seed transaction.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param transactionId - Transaction UUID.
 * @param vendor - Vendor string from seed fixture.
 * @param memo - Optional memo from seed fixture.
 * @param dimensions - Embedding vector size from env.
 */
async function upsertDeterministicSeedEmbedding(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  transactionId: string,
  vendor: string,
  memo: string | undefined,
  dimensions: number,
): Promise<void> {
  const text = buildEmbeddingText(vendor, memo);
  const embedding = buildDeterministicEmbedding(text, dimensions);
  const vectorLiteral = `[${embedding.join(",")}]`;

  await db.execute(sql`
    INSERT INTO transaction_embeddings (tenant_id, transaction_id, embedding, embedding_model)
    VALUES (${tenantId}, ${transactionId}, ${vectorLiteral}::vector, ${"deterministic-seed"})
    ON CONFLICT (transaction_id)
    DO UPDATE SET
      embedding = EXCLUDED.embedding,
      embedding_model = EXCLUDED.embedding_model
  `);
}

/**
 * Seeds tenants, CoA, vendors, rules, labeled transactions, and embeddings.
 *
 * @returns Promise that resolves when seed completes.
 * @throws Error when database operations fail.
 */
async function main(): Promise<void> {
  getRootDb();
  const env = loadEnv();
  const useLiveEmbeddings = env.LLM_ENABLE_LIVE_CALLS && hasProviderApiKey(env);

  if (!useLiveEmbeddings) {
    console.log(
      "Seed: using deterministic embeddings (set GOOGLE_API_KEY + LLM_ENABLE_LIVE_CALLS=true for live embeddings)",
    );
  } else {
    console.log(`Seed: using live embeddings via LLM_PROVIDER=${env.LLM_PROVIDER}`);
  }

  await runWithRlsBypass(async () => {
    const db = getDb();

  for (const tenantSeed of TENANT_SEED) {
    const existing = await db.select().from(tenants).where(eq(tenants.slug, tenantSeed.slug)).limit(1);
    let tenantId = existing[0]?.id;

    if (!tenantId) {
      const [inserted] = await db
        .insert(tenants)
        .values({ slug: tenantSeed.slug, name: tenantSeed.name })
        .returning({ id: tenants.id });
      tenantId = inserted.id;
      console.log(`Created tenant ${tenantSeed.slug}`);
    }

    const coaByCode = new Map<string, string>();

    for (const gl of tenantSeed.coa) {
      const rows = await db
        .select()
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.tenantId, tenantId))
        .limit(100);
      let glId = rows.find((row) => row.glCode === gl.glCode)?.id;
      if (!glId) {
        const [inserted] = await db
          .insert(chartOfAccounts)
          .values({ tenantId, glCode: gl.glCode, glName: gl.glName })
          .returning({ id: chartOfAccounts.id });
        glId = inserted.id;
      }
      coaByCode.set(gl.glCode, glId);
    }

    const vendorIdByCanonical = new Map<string, string>();

    for (const vendorSeed of tenantSeed.vendorAliases) {
      let vendorId = vendorIdByCanonical.get(vendorSeed.canonical);
      if (!vendorId) {
        const existingVendor = await db
          .select()
          .from(vendors)
          .where(eq(vendors.tenantId, tenantId))
          .limit(200);
        vendorId = existingVendor.find((v) => v.canonicalName === vendorSeed.canonical)?.id;
        if (!vendorId) {
          const [inserted] = await db
            .insert(vendors)
            .values({ tenantId, canonicalName: vendorSeed.canonical })
            .returning({ id: vendors.id });
          vendorId = inserted.id;
        }
        vendorIdByCanonical.set(vendorSeed.canonical, vendorId);
      }

      const aliasExists = await db
        .select()
        .from(vendorAliases)
        .where(eq(vendorAliases.tenantId, tenantId))
        .limit(500);
      if (!aliasExists.some((row) => row.aliasRaw === vendorSeed.alias)) {
        await db.insert(vendorAliases).values({ tenantId, vendorId, aliasRaw: vendorSeed.alias });
      }

    }

    const rulesSynced = await syncSeedVendorRulesForTenant(db, tenantId, tenantSeed);
    if (rulesSynced > 0) {
      console.log(`  synced ${rulesSynced} vendor rule(s) for ${tenantSeed.slug}`);
    }

    let txnIndex = 0;
    for (const txn of tenantSeed.labeledTxns) {
      txnIndex += 1;
      const externalId = `seed-${tenantSeed.slug}-${txnIndex}`;
      const glId = coaByCode.get(txn.glCode);
      if (!glId) {
        continue;
      }

      const [insertedTxn] = await db
        .insert(transactions)
        .values({
          tenantId,
          externalTransactionId: externalId,
          idempotencyKey: `seed-${tenantSeed.slug}-${txnIndex}`,
          transactionTimestamp: new Date("2025-01-15T12:00:00.000Z"),
          amount: txn.amount,
          currency: "USD",
          vendorRaw: txn.vendor,
          memo: txn.memo,
          glAccountId: glId,
          vendorId: vendorIdByCanonical.get(
            tenantSeed.vendorAliases.find((v) => v.alias === txn.vendor)?.canonical ?? txn.vendor,
          ),
          processingStatus: "completed",
          taggingDecision: "AUTO_TAG",
          confidence: "1.0000",
        })
        .onConflictDoNothing()
        .returning({ id: transactions.id });

      let transactionId = insertedTxn?.id;
      if (!transactionId) {
        const existingTxn = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.externalTransactionId, externalId))
          .limit(1);
        transactionId = existingTxn[0]?.id;
      }

      if (!transactionId) {
        continue;
      }

      if (useLiveEmbeddings) {
        await embedAndStoreTransaction(db, env, tenantId, transactionId, txn.vendor, txn.memo);
      } else {
        await upsertDeterministicSeedEmbedding(
          db,
          tenantId,
          transactionId,
          txn.vendor,
          txn.memo,
          env.EMBEDDING_DIMENSIONS,
        );
      }
    }

    const policyPack = await seedTenantPolicyPack(db, tenantId);
    const invoiceCount = await seedMockInvoicesForTenant(db, tenantSeed.slug);
    const apiKey = await seedApiKeyForTenant(db, tenantSeed.slug);
    const webhookSecret = await seedWebhookSecretForTenant(db, tenantSeed.slug);
    const apiKeyNote = apiKey ? ` API key ${apiKey.keyPrefix}…` : "";
    const webhookNote = webhookSecret ? ` webhook ${webhookSecret.secretPrefix}…` : "";

    console.log(
      `Seeded ${tenantSeed.slug}: CoA, vendors, rules, ${tenantSeed.labeledTxns.length} labeled txns, policy ${policyPack.policyVersion}, ${invoiceCount} invoices${apiKeyNote}${webhookNote}`,
    );

    if (apiKey) {
      console.log(`  → ${tenantSeed.slug} API key (store securely): ${apiKey.rawKey}`);
    }
    if (webhookSecret) {
      console.log(`  → ${tenantSeed.slug} webhook secret (store securely): ${webhookSecret.rawSecret}`);
    }
  }

  console.log("Seed complete.");
  });
}

runCliScript(main);
