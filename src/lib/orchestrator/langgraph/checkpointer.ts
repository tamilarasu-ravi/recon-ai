import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { resolveDatabaseConnectionString } from "@/lib/db/resolve-connection-string";

export type CheckpointerBackend = "postgres" | "memory";

let checkpointerInstance: BaseCheckpointSaver | null = null;
let checkpointerInitPromise: Promise<BaseCheckpointSaver> | null = null;

/**
 * Resolves which LangGraph checkpointer backend to use from environment.
 *
 * @returns postgres or memory backend identifier.
 */
export function resolveCheckpointerBackend(): CheckpointerBackend {
  const raw = process.env.LANGGRAPH_CHECKPOINTER?.trim().toLowerCase();
  if (raw === "memory") {
    return "memory";
  }
  return "postgres";
}

/**
 * Creates and initializes the configured LangGraph checkpointer.
 *
 * @returns PostgresSaver or MemorySaver instance.
 * @throws Error when DATABASE_URL is missing for postgres backend.
 */
async function createCheckpointer(): Promise<BaseCheckpointSaver> {
  const backend = resolveCheckpointerBackend();

  if (backend === "memory") {
    return new MemorySaver();
  }

  const connectionString = resolveDatabaseConnectionString();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required for LANGGRAPH_CHECKPOINTER=postgres (or Hyperdrive binding HYPERDRIVE)",
    );
  }

  const postgresSaver = PostgresSaver.fromConnString(connectionString);
  await postgresSaver.setup();
  return postgresSaver;
}

/**
 * Returns the shared LangGraph checkpointer (Postgres by default).
 *
 * @returns Initialized checkpointer for graph.compile().
 */
export async function getOrchestratorCheckpointer(): Promise<BaseCheckpointSaver> {
  if (checkpointerInstance) {
    return checkpointerInstance;
  }

  if (!checkpointerInitPromise) {
    checkpointerInitPromise = createCheckpointer().then((instance) => {
      checkpointerInstance = instance;
      return instance;
    });
  }

  return checkpointerInitPromise;
}

/**
 * Closes the Postgres checkpointer pool and resets singletons so CLI scripts can exit.
 *
 * @returns Promise that resolves when the pool is drained (no-op for memory backend).
 */
export async function closeOrchestratorCheckpointer(): Promise<void> {
  const instance = checkpointerInstance;
  checkpointerInstance = null;
  checkpointerInitPromise = null;

  if (instance instanceof PostgresSaver) {
    await instance.end();
  }
}

/**
 * Resets checkpointer singletons (for tests only).
 */
export function resetOrchestratorCheckpointerForTests(): void {
  checkpointerInstance = null;
  checkpointerInitPromise = null;
}

/**
 * Returns the backend label for observability metadata.
 *
 * @returns Human-readable checkpointer type.
 */
export function getCheckpointerLabel(): CheckpointerBackend {
  return resolveCheckpointerBackend();
}
