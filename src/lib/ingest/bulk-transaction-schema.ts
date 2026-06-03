import { z } from "zod";

export const BULK_INGEST_MAX_ROWS = 50;

export const bulkTransactionRowSchema = z.object({
  external_transaction_id: z.string().min(1).max(128),
  transaction_timestamp: z.string().datetime(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).default("USD"),
  vendor_raw: z.string().min(1).max(256),
  memo: z.string().max(512).optional(),
  mcc: z.string().max(8).optional(),
});

export const bulkIngestBodySchema = z.object({
  tenant_id: z.string().uuid(),
  transactions: z.array(bulkTransactionRowSchema).min(1).max(BULK_INGEST_MAX_ROWS),
  async: z.boolean().default(true),
});

export type BulkTransactionRow = z.infer<typeof bulkTransactionRowSchema>;

/**
 * Parses a simple CSV string into bulk ingest rows (header row required).
 *
 * @param csvText - Raw CSV contents with header line.
 * @returns Parsed rows ready for bulk ingest API.
 * @throws Error when header is missing or a data row is invalid.
 */
export function parseBulkTransactionsCsv(csvText: string): BulkTransactionRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row");
  }

  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const required = [
    "external_transaction_id",
    "transaction_timestamp",
    "amount",
    "vendor_raw",
  ];

  for (const column of required) {
    if (!header.includes(column)) {
      throw new Error(`CSV header missing required column: ${column}`);
    }
  }

  const indexByName = new Map(header.map((name, index) => [name, index]));

  const rows: BulkTransactionRow[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = lines[lineIndex].split(",").map((cell) => cell.trim());
    const pick = (name: string): string | undefined => {
      const index = indexByName.get(name);
      if (index === undefined) {
        return undefined;
      }
      return cells[index];
    };

    const parsed = bulkTransactionRowSchema.parse({
      external_transaction_id: pick("external_transaction_id"),
      transaction_timestamp: pick("transaction_timestamp"),
      amount: pick("amount"),
      currency: pick("currency") ?? "USD",
      vendor_raw: pick("vendor_raw"),
      memo: pick("memo"),
      mcc: pick("mcc"),
    });

    rows.push(parsed);

    if (rows.length > BULK_INGEST_MAX_ROWS) {
      throw new Error(`CSV exceeds maximum of ${BULK_INGEST_MAX_ROWS} rows per upload`);
    }
  }

  return rows;
}
