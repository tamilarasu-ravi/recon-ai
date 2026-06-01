import { readFileSync } from "node:fs";
import { join } from "node:path";

export type CategoryGlMap = Record<string, string | null>;

interface CategoryGlConfig {
  [tenantSlug: string]: CategoryGlMap;
}

/**
 * Loads category → GL code mapping from data/kaggle-category-to-gl.json.
 *
 * @returns Parsed mapping config keyed by tenant slug.
 */
export function loadCategoryGlMap(): CategoryGlConfig {
  const filePath = join(process.cwd(), "data/kaggle-category-to-gl.json");
  return JSON.parse(readFileSync(filePath, "utf8")) as CategoryGlConfig;
}

/**
 * Resolves a GL code for a dataset category and tenant.
 *
 * @param config - Full mapping config.
 * @param tenantSlug - Tenant slug or special key `personal-expense`.
 * @param category - Dataset category label.
 * @returns GL code string or null when unmapped.
 */
export function resolveGlCodeForCategory(
  config: CategoryGlConfig,
  tenantSlug: string,
  category: string,
): string | null {
  const tenantMap = config[tenantSlug];
  if (!tenantMap) {
    return null;
  }
  const glCode = tenantMap[category.trim().toLowerCase()];
  return glCode ?? null;
}
