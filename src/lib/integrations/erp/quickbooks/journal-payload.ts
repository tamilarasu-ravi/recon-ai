export interface QuickBooksJournalLineInput {
  amount: number;
  debitAccountId: string;
  creditAccountId: string;
  memo: string;
  transactionDate: string;
}

/**
 * Builds a QuickBooks JournalEntry create payload (double-entry).
 *
 * @param input - Amount, account ids, memo, and txn date (YYYY-MM-DD).
 * @returns JSON body for POST /journalentry.
 */
export function buildQuickBooksJournalEntryPayload(input: QuickBooksJournalLineInput): {
  TxnDate: string;
  PrivateNote: string;
  Line: Array<{
    DetailType: "JournalEntryLineDetail";
    Amount: number;
    Description: string;
    JournalEntryLineDetail: {
      PostingType: "Debit" | "Credit";
      AccountRef: { value: string };
    };
  }>;
} {
  const amount = Math.abs(input.amount);
  if (amount <= 0) {
    throw new Error("Journal entry amount must be positive");
  }

  return {
    TxnDate: input.transactionDate,
    PrivateNote: input.memo,
    Line: [
      {
        DetailType: "JournalEntryLineDetail",
        Amount: amount,
        Description: input.memo,
        JournalEntryLineDetail: {
          PostingType: "Debit",
          AccountRef: { value: input.debitAccountId },
        },
      },
      {
        DetailType: "JournalEntryLineDetail",
        Amount: amount,
        Description: input.memo,
        JournalEntryLineDetail: {
          PostingType: "Credit",
          AccountRef: { value: input.creditAccountId },
        },
      },
    ],
  };
}

/**
 * Escapes a GL code for use inside a QBO SQL query string literal.
 *
 * @param glCode - Chart of accounts code from tenant CoA.
 * @returns Escaped literal safe for `AcctNum = '…'`.
 */
export function escapeQuickBooksQueryLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
