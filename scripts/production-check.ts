#!/usr/bin/env tsx
/**
 * Validates configuration before production deploy.
 *
 * Usage: pnpm production:check
 * Exits 1 on blocking errors when NODE_ENV=production or VERCEL_ENV=production.
 */

import { config as loadDotenv } from "dotenv";

import {
  collectProductionConfigIssues,
  isProductionDeployment,
} from "@/lib/config/runtime";

loadDotenv({ path: ".env", override: true });
loadDotenv({ path: ".env.local", override: true });

/**
 * Prints issues and exits with non-zero code when errors exist in production mode.
 */
function main(): void {
  const issues = collectProductionConfigIssues();
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  console.log("ReconAI production configuration check\n");

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`  ⚠ ${warning.code}: ${warning.message}`);
    }
    console.log("");
  }

  if (errors.length > 0) {
    console.log("Errors:");
    for (const error of errors) {
      console.log(`  ✗ ${error.code}: ${error.message}`);
    }
    console.log("");

    if (isProductionDeployment()) {
      console.error("Fix errors before deploying to production.");
      process.exit(1);
    }

    console.log(
      "Not in production mode — treating errors as advisory. Set NODE_ENV=production to enforce.",
    );
    process.exit(0);
  }

  console.log("✓ No blocking configuration issues detected.");
  if (!isProductionDeployment()) {
    console.log("  (Advisory only — run with NODE_ENV=production to enforce strictly.)");
  }
}

main();
