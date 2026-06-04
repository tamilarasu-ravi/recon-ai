import { randomUUID } from "node:crypto";

import type { DbClient } from "@/lib/db/client";
import { getErpConnection } from "@/lib/integrations/erp/erp-connections";
import type { ErpAdapter, ErpPostJournalInput, ErpPostJournalResult } from "@/lib/integrations/erp/types";
import { ensureQuickBooksSession } from "@/lib/integrations/erp/quickbooks/connection-session";
import { QUICKBOOKS_PROVIDER_ID } from "@/lib/integrations/erp/quickbooks/config";
import {
  postQuickBooksJournalEntry,
  resolveQuickBooksAccountId,
  resolveQuickBooksOffsetAccountId,
} from "@/lib/integrations/erp/quickbooks/qbo-api";

const DEFAULT_JOURNAL_DATE = new Date().toISOString().slice(0, 10);

/**
 * Returns true when journal posts should use the legacy stub instead of the QBO API.
 *
 * @returns True when QUICKBOOKS_JOURNAL_STUB is set to true/1.
 */
function isQuickBooksJournalStubEnabled(): boolean {
  const value = process.env.QUICKBOOKS_JOURNAL_STUB?.trim().toLowerCase();
  return value === "true" || value === "1";
}

/**
 * QuickBooks sandbox adapter — refreshes OAuth tokens and posts JournalEntry to QBO.
 */
export class QuickBooksSandboxAdapter implements ErpAdapter {
  readonly provider = QUICKBOOKS_PROVIDER_ID;
  readonly sandbox = true;

  /**
   * @param db - Database client for token lookup.
   * @param tenantId - Tenant UUID.
   */
  constructor(
    private readonly db: DbClient,
    private readonly tenantId: string,
  ) {}

  /**
   * Posts a journal entry to QuickBooks sandbox (or stub when QUICKBOOKS_JOURNAL_STUB=true).
   *
   * @param input - Transaction and GL fields.
   * @returns Posted journal metadata.
   * @throws Error when OAuth connection is missing or QBO API fails.
   */
  async postJournalEntry(input: ErpPostJournalInput): Promise<ErpPostJournalResult> {
    const connection = await getErpConnection(this.db, this.tenantId, QUICKBOOKS_PROVIDER_ID);
    if (!connection) {
      throw new Error("QuickBooks is not connected for this tenant");
    }

    if (isQuickBooksJournalStubEnabled()) {
      return this.postJournalStub(input, connection.realmId);
    }

    const session = await ensureQuickBooksSession(this.db, this.tenantId);
    const amount = Number.parseFloat(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Invalid transaction amount for QuickBooks post: ${input.amount}`);
    }

    const debitAccountId = await resolveQuickBooksAccountId(session, input.glCode);
    const creditAccountId = await resolveQuickBooksOffsetAccountId(session);

    const memo = `ReconAI ${input.externalTransactionId} ${input.vendorRaw}`.slice(0, 4000);
    const externalId = await postQuickBooksJournalEntry({
      session,
      amount,
      debitAccountId,
      creditAccountId,
      memo,
      transactionDate: DEFAULT_JOURNAL_DATE,
    });

    return {
      provider: this.provider,
      externalId,
      postedAt: new Date().toISOString(),
      sandbox: this.sandbox,
    };
  }

  /**
   * Legacy stub post for local dev without QBO account mapping.
   *
   * @param input - Transaction fields.
   * @param realmId - Optional QuickBooks company id.
   * @returns Synthetic external id.
   */
  private postJournalStub(
    input: ErpPostJournalInput,
    realmId: string | null,
  ): ErpPostJournalResult {
    const postedAt = new Date().toISOString();
    const realmSuffix = realmId ? realmId.slice(0, 8) : "norealm";
    const externalId = `qb-${realmSuffix}-${input.externalTransactionId.slice(0, 16)}-${randomUUID().slice(0, 8)}`;

    return {
      provider: this.provider,
      externalId,
      postedAt,
      sandbox: this.sandbox,
    };
  }
}
