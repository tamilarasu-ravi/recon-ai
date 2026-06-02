"use client";

import mermaid from "mermaid";
import { useEffect, useId, useRef, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
  title?: string;
}

/**
 * Renders a Mermaid flowchart in the browser for orchestrator topology.
 *
 * @param props - Mermaid source and optional title.
 * @returns SVG diagram container or error message.
 */
export function MermaidDiagram({ chart, title }: MermaidDiagramProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "strict",
        });

        const renderId = `mermaid-${reactId}`;
        const { svg } = await mermaid.render(renderId, chart);

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Mermaid render failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  return (
    <div style={{ marginTop: "0.75rem" }}>
      {title ? <p className="graph-timeline__title">{title}</p> : null}
      {error ? (
        <p className="alert alert--error">{error}</p>
      ) : (
        <div ref={containerRef} className="panel mermaid-panel" />
      )}
    </div>
  );
}
