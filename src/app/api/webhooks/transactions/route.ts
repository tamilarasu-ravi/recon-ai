import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyWebhookSignatureForTenant } from "@/lib/auth/webhook-secrets-admin";
import { getDb } from "@/lib/db/client";
import { resolveTenantIdBySlug } from "@/lib/integrations/webhooks/resolve-tenant";
import { webhookSignatureHeaderName } from "@/lib/integrations/webhooks/verify-signature";
import { runTaggingPipeline } from "@/lib/orchestrator/run-pipeline";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DEFAULT_TOLERANCE_SEC = 300;

const webhookIngestSchema = z.object({
  external_transaction_id: z.string().min(1).max(128),
  transaction_timestamp: z.string().datetime(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).default("USD"),
  vendor_raw: z.string().min(1).max(256),
  memo: z.string().max(512).optional(),
  mcc: z.string().max(8).optional(),
});

/**
 * Ingests a transaction from an external system via signed webhook (HMAC-SHA256).
 * Query: tenant_slug. Header: X-Recon-Signature t=...,v1=...
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get("tenant_slug")?.trim();
    if (!tenantSlug) {
      return NextResponse.json({ error: "tenant_slug query parameter is required" }, { status: 400 });
    }

    const rawBody = await request.text();
    const signatureHeader = request.headers.get(webhookSignatureHeaderName());

    const db = getDb();
    const tenantId = await resolveTenantIdBySlug(db, tenantSlug);
    if (!tenantId) {
      return NextResponse.json({ error: "Unknown tenant_slug" }, { status: 404 });
    }

    const toleranceSec = Number(process.env.WEBHOOK_SIGNATURE_TOLERANCE_SEC ?? DEFAULT_TOLERANCE_SEC);
    const verified = await verifyWebhookSignatureForTenant(
      db,
      tenantId,
      rawBody,
      signatureHeader,
      Number.isFinite(toleranceSec) ? toleranceSec : DEFAULT_TOLERANCE_SEC,
    );

    if (!verified) {
      return NextResponse.json({ error: "Invalid or missing webhook signature" }, { status: 401 });
    }

    let bodyJson: unknown;
    try {
      bodyJson = JSON.parse(rawBody) as unknown;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = webhookIngestSchema.parse(bodyJson);

    const result = await runTaggingPipeline(db, {
      tenantId,
      externalTransactionId: parsed.external_transaction_id,
      transactionTimestamp: parsed.transaction_timestamp,
      amount: parsed.amount,
      currency: parsed.currency,
      vendorRaw: parsed.vendor_raw,
      memo: parsed.memo,
      mcc: parsed.mcc,
    });

    return NextResponse.json(
      { ...result, source: "webhook" },
      {
        status:
          result.status === "duplicate"
            ? 200
            : result.status === "pending_approval"
              ? 202
              : 201,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook ingest failed";
    const status = message.includes("signature") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
