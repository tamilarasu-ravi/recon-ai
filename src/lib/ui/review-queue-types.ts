/** Review queue row as returned by the list API (JSON-serializable). */
export interface ReviewQueueItemDto {
  id: string;
  reason: string;
  status: string;
  runId: string;
  createdAt: string;
  transactionId: string;
  externalTransactionId: string;
  vendorRaw: string;
  amount: string;
  currency: string;
  taggingDecision: string | null;
  confidence: string | null;
  suggestedGlCode: string | null;
}

export type ReviewQueueStatusFilter = "open" | "resolved" | "all";

export interface ReviewQueuePageDto {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ReviewQueueListResponse {
  items: ReviewQueueItemDto[];
  page: ReviewQueuePageDto;
}
