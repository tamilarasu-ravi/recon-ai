"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTenant } from "@/app/components/tenant-provider";

const linkStyle = (active: boolean): React.CSSProperties => ({
  marginRight: "1rem",
  color: active ? "#111" : "#555",
  fontWeight: active ? 600 : 400,
  textDecoration: "none",
});

/**
 * Top navigation with tenant selector for capstone demo UI.
 *
 * @returns Nav bar element.
 */
export function AppNav(): React.ReactElement {
  const pathname = usePathname();
  const { tenants, tenantId, setTenantId, loading, error } = useTenant();

  return (
    <header
      style={{
        borderBottom: "1px solid #e5e7eb",
        padding: "1rem 2rem",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "1rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <strong style={{ marginRight: "1.5rem" }}>ReconAI</strong>
      <nav>
        <Link href="/" style={linkStyle(pathname === "/")}>
          Home
        </Link>
        <Link href="/review-queue" style={linkStyle(pathname.startsWith("/review-queue"))}>
          Review queue
        </Link>
      </nav>
      <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.875rem", color: "#666" }}>Tenant</span>
        <select
          value={tenantId ?? ""}
          disabled={loading || tenants.length === 0}
          onChange={(e) => setTenantId(e.target.value)}
          style={{ padding: "0.35rem 0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.slug}
            </option>
          ))}
        </select>
      </label>
      {error ? <span style={{ color: "#b91c1c", fontSize: "0.875rem" }}>{error}</span> : null}
    </header>
  );
}
