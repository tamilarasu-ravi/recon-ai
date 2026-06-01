import type { DbClient } from "@/lib/db/client";
import { auditLog, events } from "@/lib/db/schema";
import { scheduleLangfuseExport } from "@/lib/observability/langfuse-export";

export interface AppendEventInput {
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  runId: string;
}

export interface AppendAuditInput {
  tenantId: string;
  runId: string;
  agent: string;
  transactionId?: string;
  invoiceId?: string;
  decision?: "AUTO_TAG" | "QUEUE_REVIEW" | "REFUSE";
  confidence?: number;
  policyVersion?: string;
  observability: Record<string, unknown>;
}

/**
 * Appends an immutable domain event for a tenant workflow.
 *
 * @param db - Drizzle database client.
 * @param input - Event type, payload, and run correlation id.
 * @returns Inserted event row id.
 */
export async function appendEvent(db: DbClient, input: AppendEventInput): Promise<string> {
  const [row] = await db
    .insert(events)
    .values({
      tenantId: input.tenantId,
      eventType: input.eventType,
      payload: input.payload,
      runId: input.runId,
    })
    .returning({ id: events.id });

  return row.id;
}

/**
 * Writes a structured audit log entry with observability payload.
 *
 * @param db - Drizzle database client.
 * @param input - Agent run metadata and step traces.
 * @returns Inserted audit log row id.
 */
export async function appendAuditLog(db: DbClient, input: AppendAuditInput): Promise<string> {
  const [row] = await db
    .insert(auditLog)
    .values({
      tenantId: input.tenantId,
      runId: input.runId,
      agent: input.agent,
      transactionId: input.transactionId,
      invoiceId: input.invoiceId,
      decision: input.decision,
      confidence: input.confidence !== undefined ? String(input.confidence) : undefined,
      policyVersion: input.policyVersion,
      observability: input.observability,
    })
    .returning({ id: auditLog.id });

  scheduleLangfuseExport(input);

  return row.id;
}
