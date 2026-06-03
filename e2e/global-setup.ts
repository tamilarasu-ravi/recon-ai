import { execSync } from "node:child_process";

/**
 * Prepares the database before Playwright starts the Next.js server.
 */
async function globalSetup(): Promise<void> {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5434/cfo_capstone";

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    LLM_ENABLE_LIVE_CALLS: "false",
    LANGGRAPH_CHECKPOINTER: "memory",
    AUTO_TAG_HITL_ENABLED: "false",
    REQUIRE_API_AUTH: "false",
  };

  execSync("pnpm db:migrate", { stdio: "inherit", env });
  execSync("pnpm db:seed", { stdio: "inherit", env });
}

export default globalSetup;
