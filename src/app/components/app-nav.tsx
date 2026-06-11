"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthUserMenu } from "@/app/components/auth-user-menu";
import { useTenant } from "@/app/components/tenant-provider";

/**
 * Top navigation with tenant selector for the ReconAI operator UI.
 *
 * @returns Nav bar element.
 */
export function AppNav(): React.ReactElement {
  const pathname = usePathname();
  const { tenants, tenantId, tenantRole, setTenantId, loading, error } = useTenant();

  const navItems = [
    { href: "/", label: "Home", active: pathname === "/" },
    { href: "/review-queue", label: "Review queue", active: pathname.startsWith("/review-queue") },
    { href: "/ap", label: "AP inbox", active: pathname.startsWith("/ap") },
    { href: "/policy", label: "Policy", active: pathname.startsWith("/policy") },
    { href: "/orchestrator", label: "Orchestrator", active: pathname.startsWith("/orchestrator") },
    { href: "/settings", label: "Settings", active: pathname.startsWith("/settings") },
  ];

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link href="/" className="app-brand">
          <span className="app-brand__mark" aria-hidden>
            R
          </span>
          ReconAI
        </Link>

        <nav className="app-nav" aria-label="Main">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${item.active ? " nav-link--active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="app-header__actions">
          <label className="tenant-select">
            <span className="tenant-select__label">Company</span>
            <select
              className="select"
              value={tenantId ?? ""}
              disabled={loading || tenants.length === 0}
              onChange={(e) => setTenantId(e.target.value)}
              aria-label="Select company"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {tenantRole ? (
            <span className="badge badge--reason" style={{ textTransform: "capitalize" }}>
              {tenantRole}
            </span>
          ) : null}
          <AuthUserMenu />
          {error ? <span className="alert alert--error" style={{ padding: "0.25rem 0.5rem" }}>{error}</span> : null}
        </div>
      </div>
    </header>
  );
}
