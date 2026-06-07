import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import {
  buildSloSnapshot,
  type SloSnapshot,
  sumGraphStepLatencyMs,
} from "@/lib/observability/slo-metrics";

const SLO_SAMPLE_LIMIT = 100;

/**
 * Aggregates recent tagging-run latencies and costs for tenant SLO dashboards.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns SLO snapshot from the latest tagging audit rows.
 */
export async function getTenantSloMetrics(db: DbClient, tenantId: string): Promise<SloSnapshot> {
  const rows = await db
    .select({ observability: auditLog.observability })
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.agent, "tagging")))
    .orderBy(desc(auditLog.createdAt))
    .limit(SLO_SAMPLE_LIMIT);

  const graphLatenciesMs: number[] = [];
  const liveLlmCostsUsd: number[] = [];

  for (const row of rows) {
    const latency = sumGraphStepLatencyMs(row.observability);
    if (latency !== null) {
      graphLatenciesMs.push(latency);
    }

    if (row.observability && typeof row.observability === "object") {
      const obs = row.observability as Record<string, unknown>;
      if (obs.llm_skipped === false && typeof obs.cost_usd === "number") {
        liveLlmCostsUsd.push(obs.cost_usd);
      }
    }
  }

  return buildSloSnapshot(graphLatenciesMs, liveLlmCostsUsd);
}
