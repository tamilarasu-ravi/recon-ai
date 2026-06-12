/** Seeded demo company shown in the header Company dropdown (slug is internal only). */
export interface DemoTenantLabel {
  slug: string;
  name: string;
}

/** tenant-a — primary tagging / policy demo tenant. */
export const DEMO_TENANT_ACME: DemoTenantLabel = {
  slug: "tenant-a",
  name: "Acme Labs",
};

/** tenant-b — REFUSE and Northwind CoA demo tenant. */
export const DEMO_TENANT_NORTHWIND: DemoTenantLabel = {
  slug: "tenant-b",
  name: "Northwind Trading",
};
