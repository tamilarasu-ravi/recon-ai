import { randomUUID } from "node:crypto";

import type { DbClient } from "@/lib/db/client";
import { getErpConnection } from "@/lib/integrations/erp/erp-connections";
import type { ErpAdapter, ErpPostJournalInput, ErpPostJournalResult } from "@/lib/integrations/erp/types";
import { QUICKBOOKS_PROVIDER_ID } from "@/lib/integrations/erp/quickbooks/config";

/**
 * QuickBooks sandbox adapter — uses stored OAuth tokens; journal post is sandbox-stubbed until full QBO write ships.
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
   * Posts a journal entry — records a sandbox external id when OAuth is connected.
   *
   * @param input - Transaction and GL fields.
   * @returns Posted journal metadata.
   * @throws Error when OAuth connection is missing.
   */
  async postJournalEntry(input: ErpPostJournalInput): Promise<ErpPostJournalResult> {
    const connection = await getErpConnection(this.db, this.tenantId, QUICKBOOKS_PROVIDER_ID);
    if (!connection) {
      throw new Error("QuickBooks is not connected for this tenant");
    }

    const postedAt = new Date().toISOString();
    const realmSuffix = connection.realmId ? connection.realmId.slice(0, 8) : "norealm";
    const externalId = `qb-${realmSuffix}-${input.externalTransactionId.slice(0, 16)}-${randomUUID().slice(0, 8)}`;

    return {
      provider: this.provider,
      externalId,
      postedAt,
      sandbox: this.sandbox,
    };
  }
}
