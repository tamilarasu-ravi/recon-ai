import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { collectProductionConfigIssues, isProductionDeployment } from "@/lib/config/runtime";
import { getDb } from "@/lib/db/client";

/**
 * Readiness probe — database connectivity and pgvector extension (for orchestrators / Vercel).
 */
export async function GET(): Promise<NextResponse> {
  const checks: Record<string, string> = {};
  const errors: string[] = [];

  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    checks.database = "ok";

    const vectorRows = await db.execute<{ extname: string }>(
      sql`select extname from pg_extension where extname = 'vector'`,
    );
    if (vectorRows.length === 0) {
      errors.push("pgvector extension not installed");
      checks.pgvector = "missing";
    } else {
      checks.pgvector = "ok";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database check failed";
    errors.push(message);
    checks.database = "error";
  }

  if (isProductionDeployment()) {
    const configIssues = collectProductionConfigIssues().filter(
      (issue) => issue.severity === "error",
    );
    for (const issue of configIssues) {
      errors.push(issue.message);
    }
    checks.production_config = configIssues.length === 0 ? "ok" : "invalid";
  } else {
    checks.production_config = "skipped";
  }

  const ready = errors.length === 0;

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      checks,
      errors: errors.length > 0 ? errors : undefined,
    },
    { status: ready ? 200 : 503 },
  );
}
