import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5434/cfo_capstone";

/** Force E2E-safe flags — must win over .env.local (Next prefers process.env when set before start). */
const serverEnv: Record<string, string> = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  LLM_ENABLE_LIVE_CALLS: "false",
  LANGGRAPH_CHECKPOINTER: "memory",
  AUTO_TAG_HITL_ENABLED: "false",
  REQUIRE_API_AUTH: "false",
  // Avoid isProductionDeployment() forcing auth while running `next start` in CI.
  VERCEL_ENV: "preview",
};

if (process.env.CI) {
  serverEnv.NODE_ENV = "production";
}

const startCommand = process.env.CI ? "pnpm start" : "pnpm dev";

/**
 * Playwright configuration for smoke and operator-flow E2E tests.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: startCommand,
    url: `${baseURL}/api/health`,
    // Always start an isolated server with REQUIRE_API_AUTH=false (do not reuse `pnpm dev`).
    reuseExistingServer: false,
    timeout: 180_000,
    env: serverEnv,
  },
});
