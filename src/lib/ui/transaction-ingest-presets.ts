/** Values the ingest API accepts for a single synthetic card transaction. */
export interface TransactionIngestFormValues {
  vendorRaw: string;
  amount: string;
  currency: string;
  memo: string;
  mcc: string;
}

/** Scenario preset shown in the new-transaction form. */
export interface TransactionIngestPreset {
  id: string;
  label: string;
  description: string;
  expectedOutcome: string;
  values: TransactionIngestFormValues;
}

/** Known vendor aliases seeded per demo tenant slug. */
export const TENANT_VENDOR_OPTIONS: Record<string, readonly string[]> = {
  "tenant-a": ["aws", "amazon web services", "slack", "starbucks"],
  "tenant-b": ["fedex", "google ads", "staples"],
};

const CUSTOM_VENDOR_VALUE = "__custom__";

/** Sentinel select value when the user types a vendor not in the tenant list. */
export const CUSTOM_VENDOR_SELECT_VALUE = CUSTOM_VENDOR_VALUE;

/**
 * Returns vendor dropdown options for the active tenant slug.
 *
 * @param tenantSlug - Tenant slug from `/api/tenants` (e.g. tenant-a).
 * @returns Ordered vendor labels plus a custom entry.
 */
export function getVendorOptionsForTenant(tenantSlug: string | undefined): string[] {
  const seeded = tenantSlug ? TENANT_VENDOR_OPTIONS[tenantSlug] : undefined;
  const base = seeded ? [...seeded] : ["aws", "slack", "starbucks"];
  return base;
}

const TENANT_A_PRESETS: TransactionIngestPreset[] = [
  {
    id: "receipt-gate",
    label: "AWS $99 — receipt required",
    description: "Over $75 triggers FLAG_RECEIPT; tagging may still suggest GL 6100.",
    expectedOutcome: "QUEUE_REVIEW (receipt gate blocks AUTO_TAG until cleared)",
    values: {
      vendorRaw: "aws",
      amount: "99.00",
      currency: "USD",
      memo: "ec2 hosting — needs receipt",
      mcc: "",
    },
  },
  {
    id: "auto-tag-small",
    label: "AWS $50 — under receipt threshold",
    description: "Known vendor with vendor rule; amount below receipt policy.",
    expectedOutcome: "AUTO_TAG (when policy allows and confidence is high)",
    values: {
      vendorRaw: "aws",
      amount: "50.00",
      currency: "USD",
      memo: "lambda usage",
      mcc: "",
    },
  },
  {
    id: "slack-mid",
    label: "Slack $45 — vendor rule",
    description: "Maps to Software & Cloud via seeded vendor rule.",
    expectedOutcome: "AUTO_TAG or QUEUE_REVIEW depending on retrieval confidence",
    values: {
      vendorRaw: "slack",
      amount: "45.00",
      currency: "USD",
      memo: "team plan",
      mcc: "",
    },
  },
  {
    id: "unknown-vendor",
    label: "Unknown courier — new vendor",
    description: "No alias or rule; forces human review or refuse.",
    expectedOutcome: "QUEUE_REVIEW or REFUSE",
    values: {
      vendorRaw: "Unknown Courier 42",
      amount: "67.25",
      currency: "USD",
      memo: "one-off delivery",
      mcc: "",
    },
  },
  {
    id: "banned-mcc",
    label: "Starbucks + banned MCC",
    description: "Policy flags gambling MCC codes before tagging completes.",
    expectedOutcome: "FLAG_REVIEW via banned_mcc policy rule",
    values: {
      vendorRaw: "starbucks",
      amount: "22.10",
      currency: "USD",
      memo: "client meeting",
      mcc: "7995",
    },
  },
];

const TENANT_B_PRESETS: TransactionIngestPreset[] = [
  {
    id: "fedex-shipping",
    label: "FedEx $120 — logistics",
    description: "Seeded vendor rule maps to GL 5200.",
    expectedOutcome: "AUTO_TAG or QUEUE_REVIEW",
    values: {
      vendorRaw: "fedex",
      amount: "120.00",
      currency: "USD",
      memo: "shipping",
      mcc: "",
    },
  },
  {
    id: "google-ads",
    label: "Google Ads $500 — marketing",
    description: "High amount marketing spend on seeded vendor.",
    expectedOutcome: "AUTO_TAG or QUEUE_REVIEW",
    values: {
      vendorRaw: "google ads",
      amount: "500.00",
      currency: "USD",
      memo: "campaign",
      mcc: "",
    },
  },
  {
    id: "staples-supplies",
    label: "Staples $45 — facilities",
    description: "Office supplies on Northwind CoA.",
    expectedOutcome: "AUTO_TAG or QUEUE_REVIEW",
    values: {
      vendorRaw: "staples",
      amount: "45.00",
      currency: "USD",
      memo: "supplies",
      mcc: "",
    },
  },
  {
    id: "unknown-vendor-b",
    label: "Mystery vendor — new vendor",
    description: "Unrecognized vendor for HITL path.",
    expectedOutcome: "QUEUE_REVIEW or REFUSE",
    values: {
      vendorRaw: "Mystery Wholesale LLC",
      amount: "312.00",
      currency: "USD",
      memo: "unrecognized charge",
      mcc: "",
    },
  },
];

const DEFAULT_PRESETS = TENANT_A_PRESETS;

/**
 * Resolves ingest scenario presets for the selected tenant slug.
 *
 * @param tenantSlug - Active tenant slug or undefined before load.
 * @returns Preset list with valid seed-aligned values.
 */
export function getPresetsForTenant(tenantSlug: string | undefined): TransactionIngestPreset[] {
  if (tenantSlug === "tenant-b") {
    return TENANT_B_PRESETS;
  }
  if (tenantSlug === "tenant-a") {
    return TENANT_A_PRESETS;
  }
  return DEFAULT_PRESETS;
}

/** ISO 4217 codes accepted by the ingest API today. */
export const CURRENCY_OPTIONS = ["USD", "EUR", "GBP"] as const;

/** Optional MCC values aligned with seeded policy rules. */
export const MCC_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "None" },
  { value: "7995", label: "7995 — Gambling (banned in policy)" },
  { value: "7996", label: "7996 — Gambling (banned in policy)" },
  { value: "5814", label: "5814 — Fast food (informational)" },
];

/**
 * Formats a Date for HTML datetime-local inputs (local timezone, no Z suffix).
 *
 * @param date - Source instant.
 * @returns Value suitable for datetime-local value attribute.
 */
export function formatDatetimeLocalValue(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Builds a unique external transaction id for UI-submitted ingests.
 *
 * @param asyncMode - Whether the request uses background processing.
 * @returns External id string within API max length.
 */
export function buildExternalTransactionId(asyncMode: boolean): string {
  return `ui-${asyncMode ? "async" : "sync"}-${Date.now()}`;
}

/**
 * Maps a vendor string to the matching select value or custom sentinel.
 *
 * @param vendorRaw - Current vendor text.
 * @param vendorOptions - Dropdown options for the tenant.
 * @returns Select value for controlled vendor dropdown.
 */
export function resolveVendorSelectValue(
  vendorRaw: string,
  vendorOptions: readonly string[],
): string {
  if (vendorOptions.includes(vendorRaw)) {
    return vendorRaw;
  }
  return CUSTOM_VENDOR_SELECT_VALUE;
}
