import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  compareEvalSummaries,
  isEvalGatePassing,
  type EvalSummaryMetrics,
} from "@/lib/eval/compare-eval-summary";
import { runCliScript } from "./lib/close-cli-resources.js";

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, "eval/baseline/tagging-baseline.json");
const LATEST_FILE = join(ROOT, "eval/results/tagging-latest.json");

/**
 * Loads and parses an eval summary JSON file.
 *
 * @param path - Absolute path to summary JSON.
 * @returns Parsed metrics object.
 * @throws Error when the file is missing or invalid JSON.
 */
function loadSummary(path: string): EvalSummaryMetrics {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as EvalSummaryMetrics;
}

/**
 * Compares tagging-latest.json to the committed baseline and exits non-zero on regression.
 */
async function main(): Promise<void> {
  const baseline = loadSummary(BASELINE_FILE);
  const latest = loadSummary(LATEST_FILE);

  const issues = compareEvalSummaries(baseline, latest);

  for (const issue of issues) {
    const prefix = issue.severity === "error" ? "ERROR" : "WARN";
    console.log(`${prefix} [${issue.code}] ${issue.message}`);
  }

  if (!isEvalGatePassing(issues)) {
    console.error("\nEval gate failed — fix regressions or update baseline intentionally.");
    process.exit(1);
  }

  console.log("\nEval gate passed.");
  console.log(
    `  pass_rate: ${(latest.pass_rate * 100).toFixed(1)}% (baseline ${(baseline.pass_rate * 100).toFixed(1)}%)`,
  );
  console.log(
    `  auto_tag_precision: ${(latest.auto_tag_precision * 100).toFixed(1)}%`,
  );
}

runCliScript(main);
