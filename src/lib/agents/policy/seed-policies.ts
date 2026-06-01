import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/lib/db/client";
import { policies, policyRules } from "@/lib/db/schema";

const POLICY_VERSION = "v1.0.0";

const DEFAULT_POLICY_RULES = [
  {
    ruleType: "receipt_required",
    ruleConfig: { min_amount: 75 },
  },
  {
    ruleType: "single_transaction_cap",
    ruleConfig: { max_amount: 5000 },
  },
  {
    ruleType: "banned_mcc",
    ruleConfig: { mccs: ["7995", "7996"] },
  },
] as const;

/**
 * Seeds an active policy pack with compiled rules for a tenant (idempotent).
 *
 * @param db - Database client.
 * @param tenantId - Tenant UUID.
 * @returns Active policy id and version string.
 */
export async function seedTenantPolicyPack(
  db: DbClient,
  tenantId: string,
): Promise<{ policyId: string; policyVersion: string }> {
  await db
    .update(policies)
    .set({ isActive: false })
    .where(and(eq(policies.tenantId, tenantId), eq(policies.isActive, true)));

  const existing = await db
    .select({ id: policies.id })
    .from(policies)
    .where(and(eq(policies.tenantId, tenantId), eq(policies.policyVersion, POLICY_VERSION)))
    .limit(1);

  let policyId = existing[0]?.id;

  if (!policyId) {
    const [inserted] = await db
      .insert(policies)
      .values({
        tenantId,
        policyVersion: POLICY_VERSION,
        isActive: true,
      })
      .returning({ id: policies.id });
    policyId = inserted.id;
  } else {
    await db.update(policies).set({ isActive: true }).where(eq(policies.id, policyId));
  }

  const existingRules = await db
    .select({ ruleType: policyRules.ruleType })
    .from(policyRules)
    .where(eq(policyRules.policyId, policyId));

  const existingTypes = new Set(existingRules.map((row) => row.ruleType));

  for (const rule of DEFAULT_POLICY_RULES) {
    if (!existingTypes.has(rule.ruleType)) {
      await db.insert(policyRules).values({
        tenantId,
        policyId,
        ruleType: rule.ruleType,
        ruleConfig: rule.ruleConfig,
      });
    }
  }

  return { policyId, policyVersion: POLICY_VERSION };
}
