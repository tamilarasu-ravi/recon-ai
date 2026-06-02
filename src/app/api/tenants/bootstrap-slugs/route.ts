import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { tenants } from "@/lib/db/schema";

/**
 * Lists tenant slugs for bootstrap UI (no secrets; used before API key exists).
 */
export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const rows = await db.select({ slug: tenants.slug }).from(tenants).orderBy(tenants.slug);

  return NextResponse.json({ slugs: rows.map((row) => row.slug) });
}
