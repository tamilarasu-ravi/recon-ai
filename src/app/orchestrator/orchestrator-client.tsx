"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { MermaidDiagram } from "@/app/components/mermaid-diagram";
import { PageLayout } from "@/app/components/page-layout";

interface WorkflowMeta {
  id: string;
  name: string;
  nodes: string[];
  mermaid: string;
}

interface OrchestratorGraphResponse {
  orchestrator: string;
  version: string;
  checkpointer: string;
  hitl?: { auto_tag_enabled: boolean; node: string };
  workflows: WorkflowMeta[];
  live_mermaid?: { tagging: string | null; ap: string | null };
}

/**
 * Showcase page for LangGraph orchestrator topology and Mermaid export.
 *
 * @returns Orchestrator visualization page.
 */
export function OrchestratorClient(): React.ReactElement {
  const searchParams = useSearchParams();
  const workflowFromUrl = searchParams.get("workflow");
  const runIdFromUrl = searchParams.get("run_id");
  const [data, setData] = useState<OrchestratorGraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<string>(
    workflowFromUrl === "ap" ? "ap" : "tagging",
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/orchestrator/graph");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        setData((await response.json()) as OrchestratorGraphResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load graph metadata");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const workflow = data?.workflows.find((item) => item.id === activeWorkflow);
  const liveMermaid =
    activeWorkflow === "tagging" ? data?.live_mermaid?.tagging : data?.live_mermaid?.ap;
  const diagramSource = liveMermaid ?? workflow?.mermaid ?? "";

  return (
    <PageLayout
      title="LangGraph orchestrator"
      subtitle="Policy → tagging and AP invoice workflows as compiled state machines. Checkpoints persist by run_id. AUTO_TAG can pause at awaitAutoTagApproval for human approval."
      loading={loading}
      blocking={loading}
      blockingLabel="Loading orchestrator…"
    >
      {error ? <p className="alert alert--error">{error}</p> : null}

      {runIdFromUrl ? (
        <p className="alert alert--info" style={{ marginBottom: "1rem" }}>
          Linked run: <code>{runIdFromUrl}</code> — open the matching transaction or AP invoice
          detail page and use <strong>Run trace</strong> for step-level audit.
        </p>
      ) : null}

      {data ? (
        <>
          <div className="stat-grid" style={{ marginBottom: "1.25rem" }}>
            <div className="stat">
              <span className="stat__label">Engine</span>
              <span className="stat__value">
                {data.orchestrator} v{data.version}
              </span>
            </div>
            <div className="stat">
              <span className="stat__label">Checkpointer</span>
              <span className="stat__value">{data.checkpointer}</span>
            </div>
            <div className="stat">
              <span className="stat__label">HITL</span>
              <span className="stat__value">
                {data.hitl?.auto_tag_enabled ? "AUTO_TAG enabled" : "AUTO_TAG off"}
              </span>
            </div>
          </div>

          <div className="segmented" style={{ marginBottom: "1.25rem" }}>
            {data.workflows.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`segmented__btn${activeWorkflow === item.id ? " segmented__btn--active" : ""}`}
                onClick={() => setActiveWorkflow(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>

          {workflow ? (
            <section className="panel panel--muted">
              <h2 className="panel__title">{workflow.name}</h2>
              <div className="graph-timeline__track" style={{ marginBottom: "1rem" }}>
                {workflow.nodes.map((node, index) => (
                  <span key={node} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                    {index > 0 ? <span className="graph-arrow">→</span> : null}
                    <span className="graph-step" style={{ background: "var(--color-success-bg)", color: "var(--color-success)", borderColor: "var(--color-success-border)" }}>
                      {node}
                    </span>
                  </span>
                ))}
              </div>

              {diagramSource ? (
                <MermaidDiagram
                  chart={diagramSource}
                  title={liveMermaid ? "Live graph export" : "Static topology"}
                />
              ) : null}

              <details className="details-scroll" style={{ marginTop: "1rem" }}>
                <summary className="details-summary">Mermaid source</summary>
                <pre className="code-block code-block--light">{workflow.mermaid}</pre>
              </details>
            </section>
          ) : null}
        </>
      ) : null}
    </PageLayout>
  );
}
