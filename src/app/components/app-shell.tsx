"use client";

import type { ReactNode } from "react";

import { AppNav } from "@/app/components/app-nav";
import { TenantProvider } from "@/app/components/tenant-provider";

/**
 * Wraps pages with tenant context and navigation.
 *
 * @param children - Route content.
 * @returns Shell with nav and provider.
 */
export function AppShell({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <TenantProvider>
      <AppNav />
      {children}
    </TenantProvider>
  );
}
