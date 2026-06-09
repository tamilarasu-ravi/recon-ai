/**
 * Keeps the newest rule row per rule_type and returns ids of older duplicates.
 *
 * @param rules - Policy rule rows with id, ruleType, and createdAt.
 * @returns Rules to keep and duplicate row ids to delete.
 */
export function pickNewestRulePerType<
  T extends { id: string; ruleType: string; createdAt: Date | string },
>(rules: T[]): { kept: T[]; duplicateIds: string[] } {
  const newestByType = new Map<string, T>();
  const duplicateIds: string[] = [];

  const sorted = [...rules].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    return rightTime - leftTime;
  });

  for (const rule of sorted) {
    if (newestByType.has(rule.ruleType)) {
      duplicateIds.push(rule.id);
    } else {
      newestByType.set(rule.ruleType, rule);
    }
  }

  return {
    kept: Array.from(newestByType.values()),
    duplicateIds,
  };
}
