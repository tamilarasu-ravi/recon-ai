import { closeDb } from "@/lib/db/client";
import { closeOrchestratorCheckpointer } from "@/lib/orchestrator/langgraph/checkpointer";

/**
 * Closes postgres clients and LangGraph checkpointer pools opened during a CLI run.
 *
 * @returns Promise that resolves when resources are released.
 */
export async function closeCliResources(): Promise<void> {
  await closeDb();
  await closeOrchestratorCheckpointer();
}

/**
 * Runs an async CLI entrypoint and always tears down DB/checkpointer handles.
 *
 * @param main - Script body; may call process.exit with a non-zero code after cleanup.
 */
export function runCliScript(main: () => Promise<void>): void {
  main()
    .then(async () => {
      await closeCliResources();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await closeCliResources();
      process.exit(1);
    });
}
