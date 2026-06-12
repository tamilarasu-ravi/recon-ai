"use client";

import Link from "next/link";

import { PipelineWorkflowTrace } from "@/app/components/ingest-workflow-trace";
import { AppModal } from "@/app/components/ui/app-modal";

export interface PipelineTraceModalTarget {
  transactionId: string;
  runId: string;
  vendorRaw: string;
  externalTransactionId: string;
}

interface PipelineTraceModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: string | null;
  target: PipelineTraceModalTarget | null;
  /** When true, shows a spinner until runId is ready (reprocess in flight). */
  pending?: boolean;
  pendingLabel?: string;
}

/**
 * Modal wrapper for the live pipeline trace timeline on the review queue.
 *
 * @param props - Open state, tenant scope, and transaction/run ids.
 * @returns Modal with streaming trace or null when closed.
 */
export function PipelineTraceModal({
  open,
  onClose,
  tenantId,
  target,
  pending = false,
  pendingLabel = "Processing…",
}: PipelineTraceModalProps): React.ReactElement | null {
  if (!target || !tenantId) {
    return null;
  }

  const traceReady = !pending && target.runId.length > 0;
  const detailHref = traceReady
    ? `/transactions/${target.transactionId}?tenant_id=${encodeURIComponent(tenantId)}&run_id=${encodeURIComponent(target.runId)}`
    : null;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={pending ? "Processing expense" : "Pipeline trace"}
      description={`${target.vendorRaw} · ${target.externalTransactionId}`}
      size="wide"
      headerActions={
        detailHref ? (
          <Link href={detailHref} className="btn btn--secondary" style={{ fontSize: "0.8125rem" }}>
            Full transaction →
          </Link>
        ) : null
      }
    >
      {traceReady ? (
        <PipelineWorkflowTrace
          tenantId={tenantId}
          transactionId={target.transactionId}
          runId={target.runId}
          enabled={open}
          showDetailLink={false}
          title="Workflow steps"
        />
      ) : (
        <div className="pipeline-trace-modal__pending" aria-live="polite">
          <span className="loading-overlay__spinner" aria-hidden />
          <p>{pendingLabel}</p>
        </div>
      )}
    </AppModal>
  );
}
