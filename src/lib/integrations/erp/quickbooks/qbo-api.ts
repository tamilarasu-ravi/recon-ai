import {
  QUICKBOOKS_MINOR_VERSION,
  QUICKBOOKS_SANDBOX_API_BASE,
} from "@/lib/integrations/erp/quickbooks/constants";
import type { QuickBooksSession } from "@/lib/integrations/erp/quickbooks/connection-session";
import {
  buildQuickBooksJournalEntryPayload,
  escapeQuickBooksQueryLiteral,
} from "@/lib/integrations/erp/quickbooks/journal-payload";

const QBO_JSON_ACCEPT = "application/json";

/**
 * Builds authorization headers for QuickBooks API requests.
 *
 * @param accessToken - Valid OAuth access token.
 * @returns Headers object for fetch.
 */
function buildQuickBooksHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: QBO_JSON_ACCEPT,
    "Content-Type": QBO_JSON_ACCEPT,
  };
}

/**
 * Runs a QBO SQL query and returns the first Account row Id when present.
 *
 * @param session - OAuth session with realm id.
 * @param query - QBO query string (without URL encoding).
 * @returns Account Id or null when no row matches.
 * @throws Error when the API returns a non-2xx response.
 */
async function queryFirstAccountId(session: QuickBooksSession, query: string): Promise<string | null> {
  const url = new URL(`${QUICKBOOKS_SANDBOX_API_BASE}/${session.realmId}/query`);
  url.searchParams.set("query", query);
  url.searchParams.set("minorversion", QUICKBOOKS_MINOR_VERSION);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildQuickBooksHeaders(session.accessToken),
  });

  const body = (await response.json()) as {
    QueryResponse?: {
      Account?: Array<{ Id?: string }>;
    };
    Fault?: { Error?: Array<{ Message?: string; Detail?: string }> };
  };

  if (!response.ok) {
    const fault = body.Fault?.Error?.[0];
    throw new Error(
      `QuickBooks account query failed (${response.status}): ${fault?.Message ?? JSON.stringify(body)}`,
    );
  }

  const account = body.QueryResponse?.Account?.[0];
  return account?.Id ?? null;
}

/**
 * Resolves a QBO Account Id by tenant GL code (AcctNum) or direct env override.
 *
 * @param session - OAuth session.
 * @param glCode - Tenant chart-of-accounts code.
 * @param directAccountId - Optional env override (QUICKBOOKS_*_ACCOUNT_ID).
 * @returns QBO Account Id.
 * @throws Error when no matching account exists in QuickBooks.
 */
export async function resolveQuickBooksAccountId(
  session: QuickBooksSession,
  glCode: string,
  directAccountId?: string,
): Promise<string> {
  if (directAccountId?.trim()) {
    return directAccountId.trim();
  }

  const escaped = escapeQuickBooksQueryLiteral(glCode);
  const byAcctNum = await queryFirstAccountId(
    session,
    `select Id from Account where AcctNum = '${escaped}' maxresults 1`,
  );
  if (byAcctNum) {
    return byAcctNum;
  }

  const byName = await queryFirstAccountId(
    session,
    `select Id from Account where Name = '${escaped}' maxresults 1`,
  );
  if (byName) {
    return byName;
  }

  throw new Error(
    `No QuickBooks account found for GL code ${glCode} — map AcctNum/Name in QBO or set QUICKBOOKS_OFFSET_ACCOUNT_ID`,
  );
}

/**
 * Resolves the credit/offset account for card-txn journal entries.
 *
 * @param session - OAuth session.
 * @returns QBO Account Id for the credit line.
 * @throws Error when offset env and QBO lookup all fail.
 */
export async function resolveQuickBooksOffsetAccountId(
  session: QuickBooksSession,
): Promise<string> {
  const directAccountId = process.env.QUICKBOOKS_OFFSET_ACCOUNT_ID?.trim();
  if (directAccountId) {
    return directAccountId;
  }

  const offsetGlCode = process.env.QUICKBOOKS_OFFSET_GL_CODE?.trim();
  if (offsetGlCode) {
    return resolveQuickBooksAccountId(session, offsetGlCode);
  }

  const creditCard = await queryFirstAccountId(
    session,
    "select Id from Account where AccountType = 'Credit Card' maxresults 1",
  );
  if (creditCard) {
    return creditCard;
  }

  throw new Error(
    "QuickBooks offset account not configured — set QUICKBOOKS_OFFSET_ACCOUNT_ID or QUICKBOOKS_OFFSET_GL_CODE",
  );
}

export interface PostQuickBooksJournalInput {
  session: QuickBooksSession;
  amount: number;
  debitAccountId: string;
  creditAccountId: string;
  memo: string;
  transactionDate: string;
}

/**
 * Creates a JournalEntry in QuickBooks sandbox and returns the QBO entity Id.
 *
 * @param input - Session, accounts, amount, memo, and txn date.
 * @returns QuickBooks JournalEntry Id.
 * @throws Error when the create API returns a non-2xx response.
 */
export async function postQuickBooksJournalEntry(
  input: PostQuickBooksJournalInput,
): Promise<string> {
  const payload = buildQuickBooksJournalEntryPayload({
    amount: input.amount,
    debitAccountId: input.debitAccountId,
    creditAccountId: input.creditAccountId,
    memo: input.memo,
    transactionDate: input.transactionDate,
  });

  const url = new URL(`${QUICKBOOKS_SANDBOX_API_BASE}/${input.session.realmId}/journalentry`);
  url.searchParams.set("minorversion", QUICKBOOKS_MINOR_VERSION);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: buildQuickBooksHeaders(input.session.accessToken),
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as {
    JournalEntry?: { Id?: string };
    Fault?: { Error?: Array<{ Message?: string; Detail?: string }> };
  };

  if (!response.ok) {
    const fault = body.Fault?.Error?.[0];
    throw new Error(
      `QuickBooks journal post failed (${response.status}): ${fault?.Message ?? JSON.stringify(body)}`,
    );
  }

  const externalId = body.JournalEntry?.Id;
  if (!externalId) {
    throw new Error("QuickBooks journal post succeeded but returned no JournalEntry Id");
  }

  return externalId;
}
