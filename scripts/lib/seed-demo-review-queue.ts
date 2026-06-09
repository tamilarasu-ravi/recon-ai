import { randomUUID } from "node:crypto";

import { and, eq, inArray, like } from "drizzle-orm";

import { getTenantIdBySlug } from "@/lib/orchestrator/run-ap-pipeline";
import type { DbClient } from "@/lib/db/client";
import { chartOfAccounts, reviewQueue, transactions } from "@/lib/db/schema";

export const DEMO_REVIEW_QUEUE_PER_TENANT = 30;
export const DEMO_REVIEW_QUEUE_OPEN_COUNT = 12;

const SHOWCASE_EXTERNAL_ID_PREFIX = "demo-showcase-rq";

const TENANT_SHOWCASE_VENDORS: Record<string, readonly string[]> = {
  "tenant-a": [
    "aws",
    "slack",
    "starbucks",
    "Zephyr Labs LLC",
    "Unknown SaaS Co",
    "Cloudflare Inc",
    "Notion Labs",
    "Figma",
  ],
  "tenant-b": [
    "fedex",
    "google ads",
    "staples",
    "Unknown Courier 42",
    "Regional Freight LLC",
    "PrintShop Express",
    "Trade Show Booth Co",
    "Warehouse Rent LLC",
  ],
};

const SHOWCASE_REASONS: readonly { reason: string; decision: "QUEUE_REVIEW" | "REFUSE" }[] = [
  { reason: "new_vendor", decision: "QUEUE_REVIEW" },
  { reason: "receipt_required", decision: "QUEUE_REVIEW" },
  { reason: "low_confidence_review_band", decision: "QUEUE_REVIEW" },
  { reason: "high_risk_gl_review", decision: "QUEUE_REVIEW" },
  { reason: "coa_mismatch", decision: "REFUSE" },
  { reason: "unknown_vendor_pattern", decision: "REFUSE" },
  { reason: "new_vendor_no_support", decision: "REFUSE" },
];

export interface SeedDemoReviewQueueResult {
  tenantSlug: string;
  tenantId: string;
  inserted: number;
  open: number;
  resolved: number;
}

/**
 * Removes prior demo showcase review-queue rows for a tenant (idempotent re-runs).
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param tenantSlug - Tenant slug used in external ids.
 */
async function deleteExistingShowcaseReviewQueue(
  db: DbClient,
  tenantId: string,
  tenantSlug: string,
): Promise<void> {
  const pattern = `${SHOWCASE_EXTERNAL_ID_PREFIX}-${tenantSlug}-%`;
  const existing = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.tenantId, tenantId), like(transactions.externalTransactionId, pattern)));

  const transactionIds = existing.map((row) => row.id);
  if (transactionIds.length === 0) {
    return;
  }

  await db.delete(reviewQueue).where(inArray(reviewQueue.transactionId, transactionIds));
  await db.delete(transactions).where(inArray(transactions.id, transactionIds));
}

/**
 * Seeds showcase review-queue rows for one tenant (transactions + open/resolved queue items).
 *
 * @param db - Database client.
 * @param tenantSlug - Seeded tenant slug (tenant-a or tenant-b).
 * @param options.total - Total queue rows to create (default 30).
 * @param options.openCount - How many rows stay open; remainder are resolved.
 * @returns Counts for logging.
 * @throws Error when tenant or CoA is missing.
 */
export async function seedDemoReviewQueueForTenant(
  db: DbClient,
  tenantSlug: string,
  options?: { total?: number; openCount?: number },
): Promise<SeedDemoReviewQueueResult> {
  const total = options?.total ?? DEMO_REVIEW_QUEUE_PER_TENANT;
  const openCount = Math.min(options?.openCount ?? DEMO_REVIEW_QUEUE_OPEN_COUNT, total);
  const tenantId = await getTenantIdBySlug(db, tenantSlug);

  const coaRows = await db
    .select({ id: chartOfAccounts.id, glCode: chartOfAccounts.glCode })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.tenantId, tenantId));

  if (coaRows.length === 0) {
    throw new Error(`No chart of accounts for ${tenantSlug} — run pnpm db:seed first`);
  }

  const vendors = TENANT_SHOWCASE_VENDORS[tenantSlug];
  if (!vendors) {
    throw new Error(`Unknown showcase tenant slug: ${tenantSlug}`);
  }

  await deleteExistingShowcaseReviewQueue(db, tenantId, tenantSlug);

  const baseTimestamp = Date.now();
  let inserted = 0;

  for (let index = 1; index <= total; index += 1) {
    const isOpen = index <= openCount;
    const reasonSpec = SHOWCASE_REASONS[(index - 1) % SHOWCASE_REASONS.length];
    const vendor = vendors[(index - 1) % vendors.length];
    const glAccount = coaRows[(index - 1) % coaRows.length];
    const runId = randomUUID();
    const externalId = `${SHOWCASE_EXTERNAL_ID_PREFIX}-${tenantSlug}-${String(index).padStart(2, "0")}`;
    const amount = (25 + (index % 17) * 13.5).toFixed(2);
    const confidence = isOpen ? (0.55 + (index % 5) * 0.05).toFixed(4) : (0.82 + (index % 3) * 0.04).toFixed(4);
    const createdAt = new Date(baseTimestamp - (total - index) * 60_000);

    const [txn] = await db
      .insert(transactions)
      .values({
        tenantId,
        externalTransactionId: externalId,
        idempotencyKey: externalId,
        transactionTimestamp: createdAt,
        amount,
        currency: "USD",
        vendorRaw: vendor,
        memo: `Showcase review item ${index} (${reasonSpec.reason})`,
        suggestedGlAccountId: glAccount.id,
        taggingDecision: reasonSpec.decision,
        confidence,
        processingStatus: "completed",
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: transactions.id });

    if (!txn) {
      continue;
    }

    await db.insert(reviewQueue).values({
      tenantId,
      transactionId: txn.id,
      reason: reasonSpec.reason,
      status: isOpen ? "open" : "resolved",
      runId,
      createdAt,
    });

    inserted += 1;
  }

  return {
    tenantSlug,
    tenantId,
    inserted,
    open: openCount,
    resolved: total - openCount,
  };
}

/**
 * Seeds showcase review-queue data for all demo tenants.
 *
 * @param db - Database client.
 * @param tenantSlugs - Tenant slugs to populate.
 * @returns Per-tenant seed summaries.
 */
export async function seedDemoReviewQueueForAllTenants(
  db: DbClient,
  tenantSlugs: readonly string[] = ["tenant-a", "tenant-b"],
): Promise<SeedDemoReviewQueueResult[]> {
  const results: SeedDemoReviewQueueResult[] = [];
  for (const slug of tenantSlugs) {
    results.push(await seedDemoReviewQueueForTenant(db, slug));
  }
  return results;
}
