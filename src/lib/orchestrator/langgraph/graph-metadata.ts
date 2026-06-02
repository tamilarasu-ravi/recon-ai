import { getCheckpointerLabel, type CheckpointerBackend } from "@/lib/orchestrator/langgraph/checkpointer";

/**
 * Static Mermaid diagrams for showcase — mirrors compiled LangGraph topology.
 */
export const TAGGING_GRAPH_MERMAID = `flowchart TD
  START([START]) --> evaluatePolicy[evaluatePolicy]
  evaluatePolicy --> checkReceipt[checkReceipt]
  checkReceipt --> runTagging[runTagging]
  runTagging --> applyPolicyCap[applyPolicyCap]
  applyPolicyCap --> awaitAutoTagApproval[awaitAutoTagApproval]
  awaitAutoTagApproval -->|ingest| persistIngestOutcome[persistIngestOutcome]
  awaitAutoTagApproval -->|reprocess| persistReprocessOutcome[persistReprocessOutcome]
  awaitAutoTagApproval -.->|HITL interrupt| HUMAN{{Human approve AUTO_TAG?}}
  persistIngestOutcome --> END_NODE([END])
  persistReprocessOutcome --> END_NODE`;

export const AP_GRAPH_MERMAID = `flowchart TD
  START([START]) --> checkApDuplicate[checkApDuplicate]
  checkApDuplicate -->|duplicate| persistApDuplicateRefusal[persistApDuplicateRefusal]
  checkApDuplicate -->|new invoice| ingestApInvoice[ingestApInvoice]
  persistApDuplicateRefusal --> END_NODE([END])
  ingestApInvoice --> recommendAp[recommendAp]
  recommendAp --> persistApRecommendation[persistApRecommendation]
  persistApRecommendation --> END_NODE`;

export interface OrchestratorGraphMetadata {
  orchestrator: "langgraph";
  version: string;
  checkpointer: CheckpointerBackend;
  hitl: {
    auto_tag_enabled: boolean;
    node: "awaitAutoTagApproval";
  };
  workflows: Array<{
    id: string;
    name: string;
    nodes: string[];
    mermaid: string;
  }>;
}

/**
 * Returns static orchestrator graph metadata for API and showcase UI.
 *
 * @returns Tagging and AP workflow definitions with Mermaid source.
 */
export function getOrchestratorGraphMetadata(): OrchestratorGraphMetadata {
  const autoTagHitl = process.env.AUTO_TAG_HITL_ENABLED === "true";

  return {
    orchestrator: "langgraph",
    version: "0.3.0",
    checkpointer: getCheckpointerLabel(),
    hitl: {
      auto_tag_enabled: autoTagHitl,
      node: "awaitAutoTagApproval",
    },
    workflows: [
      {
        id: "tagging",
        name: "Policy → Tagging",
        nodes: [
          "evaluatePolicy",
          "checkReceipt",
          "runTagging",
          "applyPolicyCap",
          "awaitAutoTagApproval",
          "persistIngestOutcome",
          "persistReprocessOutcome",
        ],
        mermaid: TAGGING_GRAPH_MERMAID,
      },
      {
        id: "ap",
        name: "AP Invoice",
        nodes: [
          "checkApDuplicate",
          "persistApDuplicateRefusal",
          "ingestApInvoice",
          "recommendAp",
          "persistApRecommendation",
        ],
        mermaid: AP_GRAPH_MERMAID,
      },
    ],
  };
}

/**
 * Attempts to export live Mermaid from a compiled LangGraph instance.
 *
 * @param getGraph - Async factory returning LangGraph drawable graph.
 * @returns Mermaid string or null when export is unavailable.
 */
export async function exportLiveMermaid(
  getGraph: () => Promise<{ drawMermaid: () => string }>,
): Promise<string | null> {
  try {
    const drawable = await getGraph();
    return drawable.drawMermaid();
  } catch {
    return null;
  }
}
