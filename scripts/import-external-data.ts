import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";

import { loadCategoryGlMap, resolveGlCodeForCategory } from "@/lib/data/category-gl-map";
import { importLabeledTransaction, loadCoaByCode } from "@/lib/data/import-labeled-transaction";
import {
  normalizeDecimalAmount,
  parseKaggleTransactionText,
} from "@/lib/data/parse-transaction-text";
import { loadEnv } from "@/lib/config/env";
import { createDb } from "@/lib/db/client";
import { runCliScript } from "./lib/close-cli-resources.js";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const DEFAULT_KAGGLE_TRAIN_PATH = join(process.cwd(), "data/archive/train_transactions.csv");
const DEFAULT_PERSONAL_PATH = join(
  process.cwd(),
  "data/personal_expense_classification.csv",
);

/**
 * Parses CLI args for import limits and file paths.
 *
 * @param argv - process.argv slice.
 * @returns Resolved import options.
 */
function parseArgs(argv: string[]): {
  kaggleLimit: number | null;
  skipKaggle: boolean;
  skipPersonal: boolean;
} {
  let kaggleLimit: number | null = null;
  let skipKaggle = false;
  let skipPersonal = false;

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--skip-kaggle") {
      skipKaggle = true;
    } else if (arg === "--skip-personal") {
      skipPersonal = true;
    } else if (arg === "--kaggle-limit" && argv[index + 1]) {
      kaggleLimit = Number.parseInt(argv[index + 1], 10);
      index += 1;
    } else if (arg.startsWith("--kaggle-limit=")) {
      kaggleLimit = Number.parseInt(arg.split("=")[1] ?? "", 10);
    }
  }

  return { kaggleLimit, skipKaggle, skipPersonal };
}

/**
 * Imports Kaggle train CSV rows into tenant-a labeled history.
 *
 * @param db - Database client.
 * @param env - Application environment.
 * @param tenantId - Target tenant UUID.
 * @param limit - Optional max rows to import.
 * @returns Count of newly inserted rows.
 */
async function importKaggleTrain(
  db: ReturnType<typeof createDb>,
  env: ReturnType<typeof loadEnv>,
  tenantId: string,
  limit: number | null,
): Promise<number> {
  const categoryMap = loadCategoryGlMap();
  const coaByCode = await loadCoaByCode(db, tenantId);

  const stream = createReadStream(DEFAULT_KAGGLE_TRAIN_PATH, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNumber = 0;
  let inserted = 0;
  let skipped = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (lineNumber === 1) {
      continue;
    }
    if (limit !== null && inserted >= limit) {
      break;
    }

    const commaIndex = line.lastIndexOf(",");
    if (commaIndex <= 0) {
      skipped += 1;
      continue;
    }

    const transactionText = line.slice(0, commaIndex);
    const category = line.slice(commaIndex + 1).trim().toLowerCase();

    const glCode = resolveGlCodeForCategory(categoryMap, "tenant-a", category);
    if (!glCode) {
      skipped += 1;
      continue;
    }

    const parsed = parseKaggleTransactionText(transactionText);
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const externalId = `kaggle-train-${lineNumber}`;
    const didInsert = await importLabeledTransaction(db, env, coaByCode, {
      tenantId,
      externalTransactionId: externalId,
      idempotencyKey: externalId,
      vendorRaw: parsed.vendorRaw,
      memo: category,
      amount: parsed.amount,
      currency: parsed.currency,
      glCode,
      transactionTimestamp: new Date("2025-01-15T12:00:00.000Z"),
    });

    if (didInsert) {
      inserted += 1;
    }
  }

  console.log(`Kaggle train: inserted=${inserted}, skipped_unmapped_or_duplicate=${skipped}`);
  return inserted;
}

/**
 * Imports personal_expense_classification.csv into tenant-a.
 *
 * @param db - Database client.
 * @param env - Application environment.
 * @param tenantId - Target tenant UUID.
 * @returns Count of newly inserted rows.
 */
async function importPersonalExpenses(
  db: ReturnType<typeof createDb>,
  env: ReturnType<typeof loadEnv>,
  tenantId: string,
): Promise<number> {
  const categoryMap = loadCategoryGlMap();
  const coaByCode = await loadCoaByCode(db, tenantId);

  const stream = createReadStream(DEFAULT_PERSONAL_PATH, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNumber = 0;
  let inserted = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (lineNumber === 1) {
      continue;
    }

    const parts = line.split(",");
    if (parts.length < 5) {
      continue;
    }

    const expenseId = parts[0];
    const amount = normalizeDecimalAmount(parts[1]);
    const merchant = parts[2];
    const description = parts[3];
    const category = parts[4].trim().toLowerCase();

    const glCode = resolveGlCodeForCategory(categoryMap, "personal-expense", category);
    if (!glCode) {
      continue;
    }

    const externalId = `personal-${expenseId}`;
    const didInsert = await importLabeledTransaction(db, env, coaByCode, {
      tenantId,
      externalTransactionId: externalId,
      idempotencyKey: externalId,
      vendorRaw: merchant,
      memo: description,
      amount,
      currency: "USD",
      glCode,
      transactionTimestamp: new Date("2025-02-01T12:00:00.000Z"),
    });

    if (didInsert) {
      inserted += 1;
    }
  }

  console.log(`Personal expenses: inserted=${inserted}`);
  return inserted;
}

/**
 * Imports external CSV datasets into tenant retrieval corpus.
 */
async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const db = createDb();
  const env = loadEnv();

  const tenantRows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, "tenant-a"))
    .limit(1);

  if (!tenantRows[0]) {
    throw new Error("tenant-a not found — run pnpm db:seed first");
  }

  const tenantId = tenantRows[0].id;
  console.log(`Importing into tenant-a (${tenantId})`);

  let total = 0;

  if (!options.skipKaggle) {
    total += await importKaggleTrain(db, env, tenantId, options.kaggleLimit);
  }

  if (!options.skipPersonal) {
    total += await importPersonalExpenses(db, env, tenantId);
  }

  console.log(`Import complete. New labeled transactions: ${total}`);
}

runCliScript(main);
