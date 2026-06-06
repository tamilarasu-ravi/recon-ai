"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PipelineTraceStepPayload } from "@/lib/pipeline/trace-step";
import { apiFetch } from "@/lib/ui/api-fetch";

export interface PipelineTraceAuditSummary {
  cost_usd?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  model?: string;
}

interface TraceSnapshotResponse {
  steps: PipelineTraceStepPayload[];
  done: boolean;
  tagging_decision: string | null;
  confidence: number | null;
  audit_summary: PipelineTraceAuditSummary | null;
  processing_status: string | null;
}

export interface UsePipelineTraceStreamResult {
  steps: PipelineTraceStepPayload[];
  auditSummary: PipelineTraceAuditSummary | null;
  done: boolean;
  decision: string | null;
  confidence: number | null;
  error: string | null;
  connected: boolean;
}

/**
 * Applies a trace snapshot to hook state.
 *
 * @param snapshot - Server trace snapshot.
 * @param apply - React state setters.
 */
function applySnapshot(
  snapshot: TraceSnapshotResponse,
  apply: {
    setSteps: (steps: PipelineTraceStepPayload[]) => void;
    setAuditSummary: (summary: PipelineTraceAuditSummary | null) => void;
    setDone: (done: boolean) => void;
    setDecision: (decision: string | null) => void;
    setConfidence: (confidence: number | null) => void;
    setConnected: (connected: boolean) => void;
  },
): void {
  apply.setSteps(snapshot.steps);
  apply.setAuditSummary(snapshot.audit_summary);
  apply.setDone(snapshot.done);
  apply.setDecision(snapshot.tagging_decision);
  apply.setConfidence(snapshot.confidence);
  apply.setConnected(true);
}

/**
 * Subscribes to pipeline trace — JSON snapshot for completed runs, SSE while live.
 *
 * @param tenantId - Active tenant UUID.
 * @param transactionId - Ingested transaction id.
 * @param runId - LangGraph run id from ingest response.
 * @param enabled - When false, no fetch is started.
 * @returns Live trace steps and terminal decision metadata.
 */
export function usePipelineTraceStream(
  tenantId: string | null,
  transactionId: string | null,
  runId: string | null,
  enabled: boolean,
): UsePipelineTraceStreamResult {
  const [steps, setSteps] = useState<PipelineTraceStepPayload[]>([]);
  const [auditSummary, setAuditSummary] = useState<PipelineTraceAuditSummary | null>(null);
  const [done, setDone] = useState(false);
  const [decision, setDecision] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback((): void => {
    setSteps([]);
    setAuditSummary(null);
    setDone(false);
    setDecision(null);
    setConfidence(null);
    setError(null);
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !tenantId || !transactionId || !runId) {
      reset();
      return;
    }

    reset();
    const controller = new AbortController();
    abortRef.current = controller;

    const query = `tenant_id=${encodeURIComponent(tenantId)}&run_id=${encodeURIComponent(runId)}`;
    const snapshotUrl = `/api/transactions/${transactionId}/trace?${query}`;
    const streamUrl = `/api/transactions/${transactionId}/trace/stream?${query}`;

    const snapshotApply = {
      setSteps,
      setAuditSummary,
      setDone,
      setDecision,
      setConfidence,
      setConnected,
    };

    /**
     * Loads a one-shot JSON snapshot (works in DevTools; instant for completed runs).
     */
    async function loadSnapshot(): Promise<TraceSnapshotResponse | null> {
      const response = await apiFetch(snapshotUrl, { signal: controller.signal });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `Trace snapshot failed (${response.status})`);
      }
      return (await response.json()) as TraceSnapshotResponse;
    }

    /**
     * Parses SSE frames from a fetch response body for in-flight runs.
     */
    async function consumeStream(): Promise<void> {
      const response = await apiFetch(streamUrl, { signal: controller.signal });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `Trace stream failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Trace stream has no body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((entry) => entry.startsWith("data: "));
          if (!line) {
            continue;
          }

          const json = line.slice("data: ".length);
          const event = JSON.parse(json) as {
            type: string;
            step?: PipelineTraceStepPayload;
            summary?: PipelineTraceAuditSummary;
            decision?: string | null;
            confidence?: number | null;
            error?: string;
          };

          if (event.type === "connected") {
            setConnected(true);
          } else if (event.type === "step" && event.step) {
            setSteps((prev) => {
              if (prev.some((item) => item.step_id === event.step?.step_id)) {
                return prev;
              }
              return [...prev, event.step as PipelineTraceStepPayload];
            });
          } else if (event.type === "audit_summary" && event.summary) {
            setAuditSummary(event.summary);
          } else if (event.type === "done") {
            setDone(true);
            setDecision(event.decision ?? null);
            setConfidence(event.confidence ?? null);
          } else if (event.type === "timeout") {
            setError("Trace stream timed out — open the transaction for full audit.");
          } else if (event.type === "error") {
            throw new Error(event.error ?? "Trace stream error");
          }
        }
      }
    }

    /**
     * Snapshot-first: replay completed runs instantly; stream only while processing.
     */
    async function loadTrace(): Promise<void> {
      try {
        const snapshot = await loadSnapshot();
        if (!snapshot) {
          return;
        }

        applySnapshot(snapshot, snapshotApply);

        const isLive =
          snapshot.processing_status === "pending" || snapshot.processing_status === "processing";

        if (snapshot.done || !isLive) {
          return;
        }

        await consumeStream();
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : "Trace load failed");
      }
    }

    void loadTrace();

    return () => {
      controller.abort();
    };
  }, [enabled, tenantId, transactionId, runId, reset]);

  return {
    steps,
    auditSummary,
    done,
    decision,
    confidence,
    error,
    connected,
  };
}
