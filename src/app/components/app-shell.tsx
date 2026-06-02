"use client";

import type { ReactNode } from "react";

import { AppNav } from "@/app/components/app-nav";
import { LoadingOverlay } from "@/app/components/loading-overlay";
import { TenantProvider, useTenant } from "@/app/components/tenant-provider";

/**
 * Inner shell that can read tenant loading state for the global bar.
 *
 * @param props - Route content.
 * @returns Nav, loading bar, and children.
 */
function AppShellInner({ children }: { children: ReactNode }): React.ReactElement {
  const { loading: tenantLoading } = useTenant();

  return (
    <>
      <LoadingOverlay active={tenantLoading} blocking label="Loading tenants…" />
      <AppNav />
      <div className="app-shell-body">{children}</div>
    </>
  );
}

/**
 * Wraps pages with tenant context and navigation.
 *
 * @param props - Route content.
 * @returns Shell with nav and provider.
 */
export function AppShell({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <TenantProvider>
      <AppShellInner>{children}</AppShellInner>
    </TenantProvider>
  );
}
