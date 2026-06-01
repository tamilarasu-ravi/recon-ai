import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { loadEnv } from "@/lib/config/env";
import { getDb } from "@/lib/db/client";

/**
 * Returns application and database health for local dev and demo checks.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const env = loadEnv();
    const db = getDb();
    await db.execute(sql`select 1`);

    return NextResponse.json({
      status: "ok",
      llm_provider: env.LLM_PROVIDER,
      llm_model: env.LLM_MODEL,
      live_calls_enabled: env.LLM_ENABLE_LIVE_CALLS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown health check error";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
