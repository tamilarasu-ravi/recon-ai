import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { runWithRlsBypass } from "@/lib/db/tenant-rls";
import { tenants } from "@/lib/db/schema";

/**
 * Lists tenant slugs for bootstrap UI (no secrets; used before API key exists).
 */
export async function GET(): Promise<NextResponse> {
  const rows = await runWithRlsBypass(async () => {
    const db = getDb();
    return db.select({ slug: tenants.slug }).from(tenants).orderBy(tenants.slug);
  });

  return NextResponse.json({ slugs: rows.map((row) => row.slug) });
}
