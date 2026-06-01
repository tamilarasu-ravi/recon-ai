export interface ConfidenceInput {
  ruleHit: boolean;
  top1Sim: number;
  agreeFrac: number;
  supportCount: number;
  hasMinHistory: boolean;
}

export interface ConfidenceResult {
  confidence: number;
  breakdown: {
    retrievalWeight: number;
    supportBoost: number;
    base: number;
  };
}

const MIN_LABELED_TXNS_FOR_HISTORY = 10;

/**
 * Computes deterministic confidence score used for tri-state routing.
 *
 * @param input - Rule and retrieval signals.
 * @returns Confidence in [0, 1] with breakdown metadata.
 */
export function scoreConfidence(input: ConfidenceInput): ConfidenceResult {
  if (input.ruleHit) {
    return {
      confidence: 1,
      breakdown: { retrievalWeight: 1, supportBoost: 0, base: 1 },
    };
  }

  const retrievalWeight = input.hasMinHistory ? 0.85 : 0.6;
  const supportBoost = input.supportCount >= 3 ? 0.1 : 0;
  const base =
    retrievalWeight * (0.7 * clamp01(input.top1Sim) + 0.3 * clamp01(input.agreeFrac)) + supportBoost;

  return {
    confidence: clamp01(base),
    breakdown: { retrievalWeight, supportBoost, base: clamp01(base) },
  };
}

/**
 * Returns whether tenant has enough labeled history for full retrieval weight.
 *
 * @param labeledTxnCount - Number of labeled transactions for tenant.
 * @returns True when count >= 10.
 */
export function hasMinHistory(labeledTxnCount: number): boolean {
  return labeledTxnCount >= MIN_LABELED_TXNS_FOR_HISTORY;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}
