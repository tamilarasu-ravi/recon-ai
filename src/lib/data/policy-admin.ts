import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { policyRuleConfigByType, type PolicyRuleType } from "@/lib/agents/policy/types";
import type { DbClient } from "@/lib/db/client";
import { policies, policyRules } from "@/lib/db/schema";

export interface PolicyRuleDto {
  id: string;
  ruleType: PolicyRuleType;
  ruleConfig: Record<string, unknown>;
  createdAt: string;
}

export interface ActivePolicyPackDto {
  policyId: string;
  policyVersion: string;
  isActive: boolean;
  rules: PolicyRuleDto[];
}

const createRuleSchema = z.object({
  tenantId: z.string().uuid(),
  ruleType: z.enum(["receipt_required", "banned_mcc", "single_transaction_cap"]),
  ruleConfig: z.record(z.unknown()),
});

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

  const ruleRows = await db
    .select({
      id: policyRules.id,
      ruleType: policyRules.ruleType,
      ruleConfig: policyRules.ruleConfig,
      createdAt: policyRules.createdAt,
    })
    .from(policyRules)
    .where(eq(policyRules.policyId, active.policyId));

  return {
    policyId: active.policyId,
    policyVersion: active.policyVersion,
    isActive: active.isActive,
    rules: ruleRows.map((row) => ({
      id: row.id,
      ruleType: row.ruleType as PolicyRuleType,
      ruleConfig: row.ruleConfig as Record<string, unknown>,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(String(row.createdAt)).toISOString(),
    })),
  };
}

/**
 * Adds a compiled rule to the tenant's active policy pack.
 *
 * @param db - Database client.
 * @param input - Tenant, rule type, and JSON config.
 * @returns Created rule DTO.
 * @throws Error when no active policy or config validation fails.
 */
export async function createPolicyRule(
  db: DbClient,
  input: z.infer<typeof createRuleSchema>,
): Promise<PolicyRuleDto> {
  const parsed = createRuleSchema.parse(input);
  const configSchema = policyRuleConfigByType[parsed.ruleType];
  const ruleConfig = configSchema.parse(parsed.ruleConfig);

  const pack = await getActivePolicyPack(db, parsed.tenantId);
  if (!pack) {
    throw new Error("No active policy pack for tenant — run db:seed first");
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
    id: inserted.id,
    ruleType: inserted.ruleType as PolicyRuleType,
    ruleConfig: inserted.ruleConfig as Record<string, unknown>,
    createdAt:
      inserted.createdAt instanceof Date
        ? inserted.createdAt.toISOString()
        : new Date(String(inserted.createdAt)).toISOString(),
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
