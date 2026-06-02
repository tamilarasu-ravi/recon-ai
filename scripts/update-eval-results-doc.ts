#!/usr/bin/env tsx
/**
 * Refreshes the summary table in docs/eval-results.md from eval/results/tagging-latest.json.
 *
 * Usage: pnpm eval:tagging && tsx scripts/update-eval-results-doc.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const RESULTS_FILE = join(ROOT, "eval/results/tagging-latest.json");
const DOC_FILE = join(ROOT, "docs/eval-results.md");

const START_MARKER = "<!-- EVAL_SUMMARY:auto -->";
const END_MARKER = "<!-- /EVAL_SUMMARY:auto -->";

interface EvalSummary {
  eval_set_version: string;
  case_count: number;
  pass_rate: number;
  auto_tag_precision: number;
  review_rate: number;
  refusal_rate: number;
  retrieval_proxy_rate?: number;
  llm_calls_saved_by_rules: number;
  total_cost_usd?: number;
  total_tokens?: number;
  llm_enable_live_calls: boolean;
  threshold_auto: number;
  failures: unknown[];
}

/**
 * Builds the auto-generated markdown block for eval-results.md.
 *
 * @param summary - Parsed eval results JSON.
 * @returns Markdown table and metadata lines.
 */
function buildSummaryBlock(summary: EvalSummary): string {
  const passPct = (summary.pass_rate * 100).toFixed(1);
  const autoPct = (summary.auto_tag_precision * 100).toFixed(1);
  const reviewPct = (summary.review_rate * 100).toFixed(1);
  const refusePct = (summary.refusal_rate * 100).toFixed(1);
  const retrievalPct =
    summary.retrieval_proxy_rate !== undefined
      ? (summary.retrieval_proxy_rate * 100).toFixed(1)
      : "—";
  const passCount = Math.round(summary.pass_rate * summary.case_count);
  const mode = summary.llm_enable_live_calls ? "live LLM" : "deterministic fixtures";
  const costLine =
    summary.total_cost_usd !== undefined && summary.total_tokens !== undefined
      ? `Aggregate cost **$${summary.total_cost_usd.toFixed(4)}** · **${summary.total_tokens}** tokens (${mode}).`
      : `Mode: **${mode}**.`;

  return [
    START_MARKER,
    "",
    `_Updated from \`eval/results/tagging-latest.json\` — do not edit by hand._`,
    "",
    "| Metric | Value | Target |",
    "|--------|-------|--------|",
    `| Pass rate | **${passPct}%** (${passCount}/${summary.case_count}) | ≥ 70% |`,
    `| Auto-tag precision | **${autoPct}%** | ≥ 95% |`,
    `| Review rate | ${reviewPct}% | — |`,
    `| Refusal rate | ${refusePct}% | — |`,
    `| Retrieval proxy (non-REFUSE) | ${retrievalPct}% | — |`,
    `| LLM calls saved by rules (proxy) | ${summary.llm_calls_saved_by_rules} | — |`,
    "",
    costLine,
    "",
    `Eval set: \`${summary.eval_set_version}\` · AUTO threshold **${summary.threshold_auto}**.`,
    summary.failures.length > 0
      ? `\n**Failures:** ${summary.failures.length} — see \`tagging-latest.json\`.`
      : "",
    "",
    END_MARKER,
  ].join("\n");
}

/**
 * Replaces the auto summary region in eval-results.md.
 */
function main(): void {
  const summary = JSON.parse(readFileSync(RESULTS_FILE, "utf8")) as EvalSummary;
  const block = buildSummaryBlock(summary);

  let doc = readFileSync(DOC_FILE, "utf8");
  const start = doc.indexOf(START_MARKER);
  const end = doc.indexOf(END_MARKER);

  if (start === -1 || end === -1) {
    throw new Error(`Markers not found in ${DOC_FILE} — add ${START_MARKER} and ${END_MARKER}`);
  }

  const endInclusive = end + END_MARKER.length;
  doc = `${doc.slice(0, start)}${block}${doc.slice(endInclusive)}`;
  writeFileSync(DOC_FILE, doc);
  console.log(`Updated ${DOC_FILE}`);
}

main();
