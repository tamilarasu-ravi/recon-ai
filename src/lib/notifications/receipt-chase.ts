import { and, eq } from "drizzle-orm";

import { appendAuditLog, appendEvent } from "@/lib/audit/writers";
import type { DbClient } from "@/lib/db/client";
import { events } from "@/lib/db/schema";

export type ReceiptChaseChannel = "mock_email" | "mock_slack" | "off";

const RECEIPT_CHASE_EVENT = "ReceiptChaseSent";

/**
 * Reads the configured receipt chase channel from environment.
 *
 * @returns Channel id; defaults to mock_email when unset.
 */
export function resolveReceiptChaseChannel(): ReceiptChaseChannel {
  const raw = process.env.RECEIPT_CHASE_CHANNEL?.trim().toLowerCase();
  if (raw === "off" || raw === "mock_slack" || raw === "mock_email") {
    return raw;
  }
  return "mock_email";
}

/**
 * Returns true when a receipt chase was already recorded for this transaction.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param transactionId - Transaction UUID.
 * @returns True when ReceiptChaseSent exists for the transaction.
 */
export async function hasReceiptChaseBeenSent(
  db: DbClient,
  tenantId: string,
  transactionId: string,
): Promise<boolean> {
  const rows = await db
    .select({ payload: events.payload })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eq(events.eventType, RECEIPT_CHASE_EVENT)));

  return rows.some((row) => {
    const payload = row.payload as Record<string, unknown> | null;
    return payload?.transaction_id === transactionId;
  });
}

export interface SendReceiptChaseInput {
  tenantId: string;
  transactionId: string;
  runId: string;
  vendorRaw: string;
  amount: string;
  currency: string;
}

export interface ReceiptChaseResult {
  sent: boolean;
  channel: ReceiptChaseChannel;
  message?: string;
}

/**
 * Sends a mock receipt chase notification once per transaction (idempotent).
 *
 * @param db - Database client.
 * @param input - Transaction context for the chase message.
 * @returns Whether a new chase was sent and which channel was used.
 */
export async function sendReceiptChaseIfNeeded(
  db: DbClient,
  input: SendReceiptChaseInput,
): Promise<ReceiptChaseResult> {
  const channel = resolveReceiptChaseChannel();
  if (channel === "off") {
    return { sent: false, channel };
  }

  if (await hasReceiptChaseBeenSent(db, input.tenantId, input.transactionId)) {
    return { sent: false, channel };
  }

  const message = buildReceiptChaseMessage(input, channel);

  await appendEvent(db, {
    tenantId: input.tenantId,
    eventType: RECEIPT_CHASE_EVENT,
    runId: input.runId,
    payload: {
      transaction_id: input.transactionId,
      channel,
      vendor_raw: input.vendorRaw,
      amount: input.amount,
      currency: input.currency,
      message,
    },
  });

  await appendAuditLog(db, {
    tenantId: input.tenantId,
    runId: input.runId,
    agent: "notifications",
    transactionId: input.transactionId,
    observability: {
      action: "receipt_chase",
      channel,
      message,
      would_send_to_provider: false,
    },
  });

  return { sent: true, channel, message };
}

/**
 * Builds mock email/Slack copy for a receipt chase notification.
 *
 * @param input - Transaction fields shown to the cardholder.
 * @param channel - Delivery channel label.
 * @returns Human-readable chase message body.
 */
function buildReceiptChaseMessage(input: SendReceiptChaseInput, channel: ReceiptChaseChannel): string {
  const amountLabel = `${input.currency} ${input.amount}`;
  if (channel === "mock_slack") {
    return `[#receipts] Please upload a receipt for ${input.vendorRaw} (${amountLabel}). Transaction ${input.transactionId.slice(0, 8)}…`;
  }
  return `Receipt required: ${input.vendorRaw} — ${amountLabel}. Upload via ReconAI to unblock auto-tagging.`;
}
