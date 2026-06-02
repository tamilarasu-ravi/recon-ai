import { randomUUID } from "node:crypto";

import type { ErpAdapter, ErpPostJournalInput, ErpPostJournalResult } from "@/lib/integrations/erp/types";

/**
 * Mock ERP adapter — simulates journal post with deterministic sandbox external ids.
 */
export class MockErpAdapter implements ErpAdapter {
  readonly provider = "mock" as const;
  readonly sandbox = true;

  /**
   * Posts a journal entry to the mock ERP and returns a synthetic external id.
   *
   * @param input - Transaction and GL fields to post.
   * @returns Posted journal metadata.
   */
  async postJournalEntry(input: ErpPostJournalInput): Promise<ErpPostJournalResult> {
    const postedAt = new Date().toISOString();
    const externalId = `mock-je-${input.externalTransactionId.slice(0, 24)}-${randomUUID().slice(0, 8)}`;

    return {
      provider: this.provider,
      externalId,
      postedAt,
      sandbox: this.sandbox,
    };
  }
}

/**
 * Resolves the configured ERP adapter from environment.
 *
 * @returns ERP adapter instance (mock by default).
 */
export function getErpAdapter(): ErpAdapter {
  const provider = process.env.ERP_PROVIDER?.trim().toLowerCase() ?? "mock";

  if (provider === "mock" || provider === "quickbooks_sandbox" || provider === "xero_sandbox") {
    return new MockErpAdapter();
  }

  return new MockErpAdapter();
}
