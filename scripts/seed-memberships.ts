import { config as loadDotenv } from "dotenv";
import { eq } from "drizzle-orm";

import { getDb, getRootDb } from "@/lib/db/client";
import { runWithRlsBypass } from "@/lib/db/tenant-rls";
import { tenantMemberships, tenants } from "@/lib/db/schema";
import { runCliScript } from "./lib/close-cli-resources.js";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const DEFAULT_MEMBERSHIPS = [
  { tenantSlug: "tenant-a", role: "admin" as const },
  { tenantSlug: "tenant-b", role: "accountant" as const },
];

/**
 * Seeds Clerk user → tenant memberships for SSO-enabled UI access.
 *
 * Usage: CLERK_SEED_USER_ID=user_xxx pnpm auth:seed-memberships
 */
async function main(): Promise<void> {
  const clerkUserId = process.env.CLERK_SEED_USER_ID?.trim();
  if (!clerkUserId) {
    throw new Error("Set CLERK_SEED_USER_ID to your Clerk user id (from dashboard or /api/me)");
  }

  getRootDb();

  await runWithRlsBypass(async () => {
    const db = getDb();

    for (const entry of DEFAULT_MEMBERSHIPS) {
      const [tenant] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, entry.tenantSlug))
        .limit(1);

      if (!tenant) {
        console.warn(`Skip ${entry.tenantSlug} — tenant not found (run pnpm db:seed first)`);
        continue;
      }

      await db
        .insert(tenantMemberships)
        .values({
          clerkUserId,
          tenantId: tenant.id,
          role: entry.role,
        })
        .onConflictDoNothing();

      console.log(`Membership: ${clerkUserId} → ${entry.tenantSlug} (${entry.role})`);
    }
  });
}

runCliScript(main);
