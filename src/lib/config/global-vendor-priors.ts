/**
 * Manually curated vendor → category hints for cold start (not learned from tenant data).
 * Used for context only; cold-start outcomes still route to QUEUE_REVIEW unless tenant rule exists.
 */
export const GLOBAL_VENDOR_PRIORS: Readonly<Record<string, string>> = {
  uber: "Travel & Entertainment",
  lyft: "Travel & Entertainment",
  aws: "Software & Cloud",
  "amazon web services": "Software & Cloud",
  google: "Software & Cloud",
  microsoft: "Software & Cloud",
  slack: "Software & Cloud",
  zoom: "Software & Cloud",
  starbucks: "Travel & Entertainment",
  delta: "Travel & Entertainment",
  united: "Travel & Entertainment",
};

/**
 * Looks up a global vendor prior category label by normalized vendor name.
 *
 * @param vendorNormalized - Lowercased trimmed vendor string.
 * @returns Category hint or undefined when no prior exists.
 */
export function lookupGlobalVendorPrior(vendorNormalized: string): string | undefined {
  return GLOBAL_VENDOR_PRIORS[vendorNormalized];
}
