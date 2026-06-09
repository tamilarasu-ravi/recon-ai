import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { pickNewestRulePerType } from "@/lib/agents/policy/dedupe-rules";
import { policyRuleConfigByType, type PolicyRuleType } from "@/lib/agents/policy/types";
import type { DbClient } from "@/lib/db/client";
import { policies, policyRules } from "@/lib/db/schema";

export interface PolicyRuleDto {
  id: string;
  ruleType: string;
  ruleConfig: Record<string, unknown>;
  createdAt: string;
}

const RULE_TYPE_SLUG_SCHEMA = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "Rule type must be a lowercase slug");

const createRuleSchema = z.object({
  tenantId: z.string().uuid(),
  ruleType: RULE_TYPE_SLUG_SCHEMA,
  ruleConfig: z.record(z.unknown()),
});

/**
 * Validates rule config for built-in types (strict) or custom types (non-empty object).
 *
 * @param ruleType - Stored rule_type slug.
 * @param ruleConfig - Parsed JSON config.
 * @returns Validated config ready for persistence.
 * @throws Error when config fails validation.
 */
function validateRuleConfig(
  ruleType: string,
  ruleConfig: Record<string, unknown>,
): Record<string, unknown> {
  if (ruleType in policyRuleConfigByType) {
    const schema = policyRuleConfigByType[ruleType as PolicyRuleType];
    return schema.parse(ruleConfig) as Record<string, unknown>;
  }

  if (Object.keys(ruleConfig).length === 0) {
    throw new Error("Custom rule configuration must include at least one field.");
  }

  return ruleConfig;
}

function toPolicyRuleDto(row: {
  id: string;
  ruleType: string;
  ruleConfig: unknown;
  createdAt: Date | string;
}): PolicyRuleDto {
  return {
    id: row.id,
    ruleType: row.ruleType,
    ruleConfig: row.ruleConfig as Record<string, unknown>,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(String(row.createdAt)).toISOString(),
  };
}

export interface PolicyRuleUpsertResult {
  rule: PolicyRuleDto;
  /** True when an existing rule of the same type was updated instead of inserting. */
  replaced: boolean;
}

export interface ActivePolicyPackDto {
  policyId: string;
  policyVersion: string;
  isActive: boolean;
  rules: PolicyRuleDto[];
}

const RULE_TYPE_ORDER: PolicyRuleType[] = [
  "receipt_required",
  "single_transaction_cap",
  "banned_mcc",
];

/**
 * Sorts policy rules in a stable admin-friendly order.
 *
 * @param rules - Normalized policy rules.
 * @returns Rules sorted by canonical type order, then createdAt.
 */
function sortPolicyRules(rules: PolicyRuleDto[]): PolicyRuleDto[] {
  return [...rules].sort((left, right) => {
    const leftIndex = RULE_TYPE_ORDER.indexOf(left.ruleType as PolicyRuleType);
    const rightIndex = RULE_TYPE_ORDER.indexOf(right.ruleType as PolicyRuleType);
    const leftSort = leftIndex === -1 ? RULE_TYPE_ORDER.length : leftIndex;
    const rightSort = rightIndex === -1 ? RULE_TYPE_ORDER.length : rightIndex;
    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }
    return left.ruleType.localeCompare(right.ruleType);
  });
}

/**
 * Removes duplicate rule_type rows for a policy pack, keeping the newest config.
 *
 * @param db - Database client.
 * @param policyId - Active policy UUID.
 */
async function normalizeDuplicatePolicyRules(
  db: DbClient,
  policyId: string,
): Promise<void> {
  const ruleRows = await db
    .select({
      id: policyRules.id,
      ruleType: policyRules.ruleType,
      ruleConfig: policyRules.ruleConfig,
      createdAt: policyRules.createdAt,
    })
    .from(policyRules)
    .where(eq(policyRules.policyId, policyId));

  const { duplicateIds } = pickNewestRulePerType(ruleRows);
  if (duplicateIds.length === 0) {
    return;
  }

  await db.delete(policyRules).where(inArray(policyRules.id, duplicateIds));
}

/**
 * Loads compiled rules for a policy pack after deduplicating by rule_type.
 *
 * @param db - Database client.
 * @param policyId - Policy UUID.
 * @returns One rule per type, sorted for display.
 */
export async function loadNormalizedPolicyRules(
  db: DbClient,
  policyId: string,
): Promise<PolicyRuleDto[]> {
  await normalizeDuplicatePolicyRules(db, policyId);

  const ruleRows = await db
    .select({
      id: policyRules.id,
      ruleType: policyRules.ruleType,
      ruleConfig: policyRules.ruleConfig,
      createdAt: policyRules.createdAt,
    })
    .from(policyRules)
    .where(eq(policyRules.policyId, policyId));

  return sortPolicyRules(ruleRows.map(toPolicyRuleDto));
}

/**
 * Loads the active policy pack and compiled rules for a tenant.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Active policy metadata and rules, or null when none active.
 */
export async function getActivePolicyPack(
  db: DbClient,
  tenantId: string,
): Promise<ActivePolicyPackDto | null> {
  const activeRows = await db
    .select({
      policyId: policies.id,
      policyVersion: policies.policyVersion,
      isActive: policies.isActive,
    })
    .from(policies)
    .where(and(eq(policies.tenantId, tenantId), eq(policies.isActive, true)))
    .limit(1);

  const active = activeRows[0];
  if (!active) {
    return null;
  }

  const ruleRows = await loadNormalizedPolicyRules(db, active.policyId);

  return {
    policyId: active.policyId,
    policyVersion: active.policyVersion,
    isActive: active.isActive,
    rules: ruleRows,
  };
}

/**
 * Adds or updates a compiled rule on the tenant's active policy pack (one rule per type).
 *
 * @param db - Database client.
 * @param input - Tenant, rule type, and JSON config.
 * @returns Upserted rule and whether an existing row was replaced.
 * @throws Error when no active policy or config validation fails.
 */
export async function createPolicyRule(
  db: DbClient,
  input: z.infer<typeof createRuleSchema>,
): Promise<PolicyRuleUpsertResult> {
  const parsed = createRuleSchema.parse(input);
  const ruleConfig = validateRuleConfig(parsed.ruleType, parsed.ruleConfig);

  const pack = await getActivePolicyPack(db, parsed.tenantId);
  if (!pack) {
    throw new Error("No active policy pack for tenant — run db:seed first");
  }

  const existingRows = await db
    .select({
      id: policyRules.id,
      ruleType: policyRules.ruleType,
      ruleConfig: policyRules.ruleConfig,
      createdAt: policyRules.createdAt,
    })
    .from(policyRules)
    .where(
      and(
        eq(policyRules.policyId, pack.policyId),
        eq(policyRules.ruleType, parsed.ruleType),
      ),
    );

  const { kept, duplicateIds } = pickNewestRulePerType(existingRows);
  const existing = kept[0];

  if (duplicateIds.length > 0) {
    await db.delete(policyRules).where(inArray(policyRules.id, duplicateIds));
  }

  if (existing) {
    const [updated] = await db
      .update(policyRules)
      .set({ ruleConfig })
      .where(eq(policyRules.id, existing.id))
      .returning({
        id: policyRules.id,
        ruleType: policyRules.ruleType,
        ruleConfig: policyRules.ruleConfig,
        createdAt: policyRules.createdAt,
      });

    return {
      rule: toPolicyRuleDto(updated),
      replaced: true,
    };
  }

  const [inserted] = await db
    .insert(policyRules)
    .values({
      tenantId: parsed.tenantId,
      policyId: pack.policyId,
      ruleType: parsed.ruleType,
      ruleConfig,
    })
    .returning({
      id: policyRules.id,
      ruleType: policyRules.ruleType,
      ruleConfig: policyRules.ruleConfig,
      createdAt: policyRules.createdAt,
    });

  return {
    rule: toPolicyRuleDto(inserted),
    replaced: false,
  };
}

/**
 * Deletes a policy rule scoped to a tenant.
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @param ruleId - Policy rule UUID.
 * @returns True when a row was deleted.
 */
export async function deletePolicyRule(
  db: DbClient,
  tenantId: string,
  ruleId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(policyRules)
    .where(and(eq(policyRules.id, ruleId), eq(policyRules.tenantId, tenantId)))
    .returning({ id: policyRules.id });

  return deleted.length > 0;
}
