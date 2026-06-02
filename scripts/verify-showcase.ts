#!/usr/bin/env tsx
/**
 * Pre-showcase verification — runs automated gates without starting the dev server.
 *
 * Usage: pnpm verify
 * Full E2E (needs Postgres): pnpm verify:full
 */

import { execSync } from "node:child_process";

const steps: Array<{ name: string; command: string; env?: Record<string, string> }> = [
  { name: "typecheck", command: "pnpm typecheck" },
  { name: "unit tests", command: "pnpm test" },
  {
    name: "tagging eval",
    command: "pnpm eval:tagging",
    env: { LLM_ENABLE_LIVE_CALLS: "false" },
  },
  { name: "production build", command: "pnpm build" },
];

/**
 * Runs a shell command and prints a labeled step banner.
 *
 * @param label - Step name for stdout.
 * @param command - Command to execute.
 * @param env - Optional extra environment variables.
 */
function runStep(label: string, command: string, env?: Record<string, string>): void {
  console.log(`\n▶ ${label}`);
  execSync(command, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

async function main(): Promise<void> {
  console.log("ReconAI showcase verification");
  const started = Date.now();

  for (const step of steps) {
    runStep(step.name, step.command, step.env);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n✅ All automated checks passed (${elapsed}s)`);
  console.log("Next: pnpm showcase:prep  (includes eval-results doc sync)");
  console.log("     docker compose up -d && pnpm db:seed && pnpm demo");
  console.log("     docs/capstone/showcase-checklist.md");
  console.log("UI:  pnpm dev → http://localhost:3000/review-queue");
}

main().catch((error: unknown) => {
  console.error("\n❌ Verification failed");
  console.error(error);
  process.exit(1);
});
