import { z } from "zod";

import { requireTenantAccess, toRouteErrorResponse } from "@/lib/api/tenant-auth";
import { getDb } from "@/lib/db/client";
import { runWithRlsBypass } from "@/lib/db/tenant-rls";
import { loadPipelineTraceSnapshot } from "@/lib/pipeline/load-trace-steps";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_INTERVAL_MS = 350;
const MAX_STREAM_MS = 55_000;

const querySchema = z.object({
  tenant_id: z.string().uuid(),
  run_id: z.string().uuid(),
});

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/**
 * Server-Sent Events stream of pipeline trace steps for live ingest UI.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: transactionId } = await context.params;
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      tenant_id: url.searchParams.get("tenant_id"),
      run_id: url.searchParams.get("run_id"),
    });

    await requireTenantAccess(request, parsed.tenant_id);

    const initial = await runWithRlsBypass(async () => {
      const db = getDb();
      return loadPipelineTraceSnapshot(
        db,
        parsed.tenant_id,
        transactionId,
        parsed.run_id,
      );
    });

    if (initial.processing_status === null && initial.steps.length === 0) {
      return Response.json({ error: "Transaction not found for tenant" }, { status: 404 });
    }

    const encoder = new TextEncoder();
    const streamStarted = Date.now();
    const seenStepIds = new Set<string>();
    let auditSummarySent = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        /**
         * Writes one SSE data frame to the stream.
         *
         * @param payload - JSON-serializable event body.
         */
        const send = (payload: unknown): void => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        try {
          send({
            type: "connected",
            transaction_id: transactionId,
            run_id: parsed.run_id,
          });

          while (Date.now() - streamStarted < MAX_STREAM_MS) {
            const snapshot = await runWithRlsBypass(async () => {
              const db = getDb();
              return loadPipelineTraceSnapshot(
                db,
                parsed.tenant_id,
                transactionId,
                parsed.run_id,
              );
            });

            for (const step of snapshot.steps) {
              if (seenStepIds.has(step.step_id)) {
                continue;
              }
              seenStepIds.add(step.step_id);
              send({ type: "step", step });
            }

            if (snapshot.audit_summary && !auditSummarySent) {
              send({ type: "audit_summary", summary: snapshot.audit_summary });
              auditSummarySent = true;
            }

            if (snapshot.done) {
              send({
                type: "done",
                decision: snapshot.tagging_decision,
                confidence: snapshot.confidence,
                processing_status: snapshot.processing_status,
              });
              controller.close();
              return;
            }

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          }

          send({ type: "timeout" });
          controller.close();
        } catch (streamError) {
          const message =
            streamError instanceof Error ? streamError.message : "Trace stream failed";
          send({ type: "error", error: message });
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    return toRouteErrorResponse(error, "Trace stream failed");
  }
}
