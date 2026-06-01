import { config as loadDotenv } from "dotenv";
import { eq } from "drizzle-orm";

import { createDb } from "@/lib/db/client";
import { chartOfAccounts, tenants } from "@/lib/db/schema";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const TENANT_SEED = [
  {
    slug: "tenant-a",
    name: "Acme Labs",
    coa: [
      { glCode: "6100", glName: "Software & Cloud" },
      { glCode: "6200", glName: "Professional Services" },
      { glCode: "6300", glName: "Travel & Entertainment" },
      { glCode: "6400", glName: "Office Supplies" },
    ],
  },
  {
    slug: "tenant-b",
    name: "Northwind Trading",
    coa: [
      { glCode: "5100", glName: "COGS — Materials" },
      { glCode: "5200", glName: "Logistics" },
      { glCode: "5300", glName: "Marketing" },
      { glCode: "5400", glName: "Facilities" },
    ],
  },
] as const;

/**
 * Seeds baseline tenants and chart-of-accounts rows for local development.
 *
 * @returns Promise that resolves when seed completes.
 * @throws Error when database operations fail.
 */
async function main(): Promise<void> {
  const db = createDb();

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
    } else {
      console.log(`Tenant ${tenantSeed.slug} already exists — skipping insert`);
    }

    for (const gl of tenantSeed.coa) {
      const coaExisting = await db
        .select()
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.tenantId, tenantId))
        .limit(100);

      const hasGl = coaExisting.some((row) => row.glCode === gl.glCode);
      if (hasGl) {
        continue;
      }

      await db.insert(chartOfAccounts).values({
        tenantId,
        glCode: gl.glCode,
        glName: gl.glName,
      });
    }
  }

  console.log("Seed complete (tenants + CoA). Synthetic transactions: TODO Phase A May 29.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
