import assert from "node:assert/strict";
import { config as loadDotenv } from "dotenv";
import { after, describe, it } from "node:test";
import { and, eq, like } from "drizzle-orm";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

import { lookupVendorRule } from "@/lib/agents/tagging/rule-lookup";
import { closeDb, getDb, getRootDb } from "@/lib/db/client";
import { runWithRlsBypass, runWithTenantRls } from "@/lib/db/tenant-rls";
import { applyTransactionOverride } from "@/lib/orchestrator/apply-override";
import {
  chartOfAccounts,
  tenants,
  transactions,
  vendorAliases,
  vendorRules,
  vendors,
} from "@/lib/db/schema";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const LEARN_VENDOR = "Eval Rule Learn Vendor LLC";
const LEARN_VENDOR_NORMALIZED = LEARN_VENDOR.trim().toLowerCase().replace(/\s+/g, " ");
const EXTERNAL_ID = "eval-learning-override-1";

/**
 * Removes eval-learning fixtures so reruns start without a pre-existing vendor rule.
 *
 * @param db - Database client (must run under RLS bypass).
 */
async function cleanupEvalLearningFixtures(db: ReturnType<typeof getDb>): Promise<void> {
  await db.delete(transactions).where(like(transactions.externalTransactionId, "eval-learning-%"));

  const learnVendors = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(eq(vendors.canonicalName, LEARN_VENDOR_NORMALIZED));

  for (const vendor of learnVendors) {
    await db.delete(vendorRules).where(eq(vendorRules.vendorId, vendor.id));
    await db.delete(vendorAliases).where(eq(vendorAliases.vendorId, vendor.id));
    await db.delete(vendors).where(eq(vendors.id, vendor.id));
  }
}

describe("vendor rule learning after override", { skip: !hasDatabase }, () => {
  after(async () => {
    await runWithRlsBypass(async () => {
      await cleanupEvalLearningFixtures(getDb());
    });
    await closeDb();
  });

  it("persists vendor rule and lookup hits on replay", async () => {
    getRootDb();

    await runWithRlsBypass(async () => {
      await cleanupEvalLearningFixtures(getDb());
    });

    const tenantId = await runWithRlsBypass(async () => {
      const db = getDb();
      const rows = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, "tenant-a"))
        .limit(1);
      assert.ok(rows[0], "tenant-a must exist — run pnpm db:seed");
      return rows[0].id;
    });

    await runWithTenantRls(tenantId, async () => {
      const db = getDb();

      const coa = await db
        .select({ id: chartOfAccounts.id, glCode: chartOfAccounts.glCode })
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.tenantId, tenantId));
      const targetGl = coa.find((row) => row.glCode === "6200");
      assert.ok(targetGl, "tenant-a GL 6200 must exist");

      const [txn] = await db
        .insert(transactions)
        .values({
          tenantId,
          externalTransactionId: EXTERNAL_ID,
          idempotencyKey: EXTERNAL_ID,
          transactionTimestamp: new Date("2026-01-02T12:00:00.000Z"),
          amount: "900.00",
          currency: "USD",
          vendorRaw: LEARN_VENDOR,
          memo: "learning loop eval",
          processingStatus: "completed",
          taggingDecision: "QUEUE_REVIEW",
        })
        .returning({ id: transactions.id, vendorId: transactions.vendorId });

      assert.ok(!txn.vendorId, "new vendor txn should not have vendorId before override");

      const override = await applyTransactionOverride(db, {
        tenantId,
        transactionId: txn.id,
        glCode: "6200",
      });

      assert.equal(override.vendorRuleCreated, true);

      const afterRule = await lookupVendorRule(db, tenantId, override.vendorId);
      assert.equal(afterRule.ruleHit, true);
      if (afterRule.ruleHit) {
        assert.equal(afterRule.glAccountId, targetGl.id);
      }
    });
  });
});
