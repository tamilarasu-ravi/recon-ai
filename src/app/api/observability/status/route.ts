import { NextResponse } from "next/server";

import { getObservabilityRuntimeStatus } from "@/lib/observability/runtime-status";

export const dynamic = "force-dynamic";

/**
 * Returns Langfuse configuration status and published SLO targets (no secrets).
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(getObservabilityRuntimeStatus());
}
