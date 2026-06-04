import assert from "node:assert/strict";
import { config as loadDotenv } from "dotenv";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

import { closeDb, getDb, getRootDb } from "@/lib/db/client";
import { runWithRlsBypass, runWithTenantRls } from "@/lib/db/tenant-rls";
import { tenants, transactions } from "@/lib/db/schema";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe("Postgres tenant RLS", { skip: !hasDatabase }, () => {
  after(async () => {
    await closeDb();
  });

  it("hides other tenants when app.tenant_id is set", async () => {
    getRootDb();

    const allTenants = await runWithRlsBypass(async () => {
      const db = getDb();
      return db.select({ id: tenants.id, slug: tenants.slug }).from(tenants);
    });

    assert.ok(allTenants.length >= 2, "seed at least tenant-a and tenant-b before running this test");

    const tenantA = allTenants.find((row) => row.slug === "tenant-a") ?? allTenants[0]!;
    const tenantB = allTenants.find((row) => row.slug === "tenant-b") ?? allTenants[1]!;

    const visibleInA = await runWithTenantRls(tenantA.id, async () => {
      const db = getDb();
      return db
        .select({ id: transactions.id, tenantId: transactions.tenantId })
        .from(transactions)
        .where(eq(transactions.tenantId, tenantB.id))
        .limit(5);
    });

    assert.equal(
      visibleInA.length,
      0,
      "tenant A scope must not return tenant B transaction rows",
    );

    const visibleInB = await runWithTenantRls(tenantB.id, async () => {
      const db = getDb();
      return db.select({ id: transactions.id }).from(transactions).limit(1);
    });

    const crossLeak = await runWithTenantRls(tenantA.id, async () => {
      const db = getDb();
      const rows = await db.select({ id: transactions.id }).from(transactions).limit(20);
      return rows.some((row) => visibleInB.some((other) => other.id === row.id));
    });

    if (visibleInB.length > 0 && visibleInA.length === 0) {
      assert.equal(crossLeak, false, "tenant A must not see tenant B transaction ids");
    }
  });

  it("allows cross-tenant reads only under app.rls_bypass", async () => {
    getRootDb();

    const bypassCount = await runWithRlsBypass(async () => {
      const db = getDb();
      const rows = await db.select({ id: transactions.id }).from(transactions).limit(5);
      return rows.length;
    });

    const tenantA = await runWithRlsBypass(async () => {
      const db = getDb();
      const rows = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, "tenant-a"))
        .limit(1);
      return rows[0]?.id;
    });

    assert.ok(tenantA, "tenant-a must exist (run pnpm db:seed)");

    const scopedCount = await runWithTenantRls(tenantA, async () => {
      const db = getDb();
      const rows = await db.select({ id: transactions.id }).from(transactions).limit(5);
      return rows.length;
    });

    assert.ok(bypassCount >= scopedCount, "bypass must see at least as many rows as tenant scope");
  });
});
