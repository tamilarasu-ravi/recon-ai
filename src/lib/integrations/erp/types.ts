export type ErpProviderId = "mock" | "quickbooks_sandbox" | "xero_sandbox";

export interface ErpPostJournalInput {
  tenantId: string;
  transactionId: string;
  runId: string;
  externalTransactionId: string;
  vendorRaw: string;
  amount: string;
  currency: string;
  glAccountId: string;
  glCode: string;
  glName: string;
}

export interface ErpPostJournalResult {
  provider: ErpProviderId;
  externalId: string;
  postedAt: string;
  sandbox: boolean;
}

export interface ErpAdapter {
  readonly provider: ErpProviderId;
  readonly sandbox: boolean;
  postJournalEntry(input: ErpPostJournalInput): Promise<ErpPostJournalResult>;
}
