#!/usr/bin/env tsx
/**
 * Pre-showcase prep — automated gates + eval-results doc sync.
 *
 * Usage: pnpm showcase:prep
 * Full path with DB demo: docker compose up -d && pnpm db:seed && pnpm showcase:prep && pnpm demo
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
  { name: "sync eval-results.md", command: "tsx scripts/update-eval-results-doc.ts" },
  { name: "production build", command: "pnpm build" },
];

/**
 * Runs a shell command with inherited stdio.
 *
 * @param label - Step name for logging.
 * @param command - Command string.
 * @param env - Optional environment overrides.
 */
function runStep(label: string, command: string, env?: Record<string, string>): void {
  console.log(`\n▶ ${label}`);
  execSync(command, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

async function main(): Promise<void> {
  console.log("ReconAI showcase prep (code-freeze gate)");
  const started = Date.now();

  for (const step of steps) {
    runStep(step.name, step.command, step.env);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n✅ Showcase prep passed (${elapsed}s)`);
  console.log("\nNext steps:");
  console.log("  1. docs/capstone/showcase-checklist.md — rehearsal script");
  console.log("  2. pnpm demo                  — CLI E2E (needs Postgres)");
  console.log("  3. pnpm dev                   — UI walkthrough");
  console.log("\nOptional live eval: LLM_ENABLE_LIVE_CALLS=true pnpm eval:tagging && tsx scripts/update-eval-results-doc.ts");
}

main().catch((error: unknown) => {
  console.error("\n❌ Showcase prep failed");
  console.error(error);
  process.exit(1);
});
