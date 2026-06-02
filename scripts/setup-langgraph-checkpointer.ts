import { config as loadDotenv } from "dotenv";

import { getOrchestratorCheckpointer, getCheckpointerLabel } from "@/lib/orchestrator/langgraph/checkpointer";
import { runCliScript } from "./lib/close-cli-resources.js";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

/**
 * Initializes LangGraph Postgres checkpoint tables (idempotent).
 */
async function main(): Promise<void> {
  const checkpointer = await getOrchestratorCheckpointer();
  console.log(`LangGraph checkpointer ready (${getCheckpointerLabel()})`);
  console.log(`Checkpointer class: ${checkpointer.constructor.name}`);
}

runCliScript(main);
