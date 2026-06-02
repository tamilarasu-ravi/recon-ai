import { NextResponse } from "next/server";

import { exportLiveMermaid, getOrchestratorGraphMetadata } from "@/lib/orchestrator/langgraph/graph-metadata";
import { getApGraph } from "@/lib/orchestrator/langgraph/ap-graph";
import { getTaggingGraph } from "@/lib/orchestrator/langgraph/tagging-graph";

/**
 * Returns LangGraph workflow metadata and optional live Mermaid exports.
 *
 * @returns JSON with static and live Mermaid diagrams for tagging and AP graphs.
 */
export async function GET(): Promise<NextResponse> {
  const metadata = getOrchestratorGraphMetadata();

  const [taggingLiveMermaid, apLiveMermaid] = await Promise.all([
    exportLiveMermaid(async () => getTaggingGraph().then((graph) => graph.getGraphAsync())),
    exportLiveMermaid(async () => getApGraph().then((graph) => graph.getGraphAsync())),
  ]);

  return NextResponse.json({
    ...metadata,
    live_mermaid: {
      tagging: taggingLiveMermaid,
      ap: apLiveMermaid,
    },
  });
}
