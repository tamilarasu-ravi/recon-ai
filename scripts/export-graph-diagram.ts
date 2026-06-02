/**
 * Prints LangGraph orchestrator Mermaid diagrams to stdout for deck / docs.
 */
import {
  exportLiveMermaid,
  getOrchestratorGraphMetadata,
} from "@/lib/orchestrator/langgraph/graph-metadata";
import { getApGraph } from "@/lib/orchestrator/langgraph/ap-graph";
import { getTaggingGraph } from "@/lib/orchestrator/langgraph/tagging-graph";
import { runCliScript } from "./lib/close-cli-resources.js";

/**
 * Exports static and live Mermaid for all orchestrator workflows.
 */
async function main(): Promise<void> {
  const metadata = getOrchestratorGraphMetadata();

  console.log(`# ReconAI LangGraph orchestrator (${metadata.version})\n`);

  for (const workflow of metadata.workflows) {
    console.log(`## ${workflow.name}\n`);
    console.log("### Static\n");
    console.log("```mermaid");
    console.log(workflow.mermaid);
    console.log("```\n");
  }

  const taggingLive = await exportLiveMermaid(async () =>
    getTaggingGraph().then((graph) => graph.getGraphAsync()),
  );
  const apLive = await exportLiveMermaid(async () => getApGraph().then((graph) => graph.getGraphAsync()));

  if (taggingLive) {
    console.log("## Tagging (live export)\n");
    console.log("```mermaid");
    console.log(taggingLive);
    console.log("```\n");
  }

  if (apLive) {
    console.log("## AP (live export)\n");
    console.log("```mermaid");
    console.log(apLive);
    console.log("```\n");
  }
}

runCliScript(main);
