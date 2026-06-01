import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { tenants } from "@/lib/db/schema";

/**
 * Lists seeded tenants (dev/demo helper — no auth).
 */
export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const rows = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants);

  return NextResponse.json({ tenants: rows });
}
