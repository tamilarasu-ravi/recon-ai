"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "recon-tenant-id";

/**
 * Returns true when the pathname is a single-transaction detail route.
 *
 * @param pathname - Current Next.js pathname.
 * @returns Whether the user is on /transactions/[id].
 */
/**
 * Returns true when the pathname is a tenant-scoped entity detail route.
 *
 * @param pathname - Current Next.js pathname.
 * @param segment - First path segment (e.g. transactions, ap).
 * @returns Whether the user is on /{segment}/[id].
 */
function isEntityDetailPath(pathname: string | null, segment: string): boolean {
  if (!pathname) {
    return false;
  }
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 2 && segments[0] === segment;
}

export interface TenantOption {
  id: string;
  slug: string;
  name: string;
}

interface TenantContextValue {
  tenants: TenantOption[];
  tenantId: string | null;
  setTenantId: (id: string) => void;
  loading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * Provides tenant list and selection for demo UI (persisted in localStorage).
 *
 * @param children - App routes.
 * @returns Provider wrapping children.
 */
export function TenantProvider({ children }: { children: ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTenants(): Promise<void> {
      try {
        const response = await fetch("/api/tenants");
        if (!response.ok) {
          throw new Error(`Failed to load tenants (${response.status})`);
        }
        const data = (await response.json()) as { tenants: TenantOption[] };
        if (cancelled) return;

        setTenants(data.tenants);
        const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        const defaultTenant =
          data.tenants.find((t) => t.slug === "tenant-a") ?? data.tenants[0];
        const initial =
          stored && data.tenants.some((t) => t.id === stored) ? stored : defaultTenant?.id ?? null;
        setTenantIdState(initial);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load tenants");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTenants();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTenantId = useCallback(
    (id: string) => {
      const isTenantSwitch = tenantId !== null && tenantId !== id;
      if (
        isTenantSwitch &&
        (isEntityDetailPath(pathname, "transactions") || isEntityDetailPath(pathname, "ap"))
      ) {
        router.replace(isEntityDetailPath(pathname, "ap") ? "/ap" : "/review-queue");
      }
      setTenantIdState(id);
      localStorage.setItem(STORAGE_KEY, id);
    },
    [tenantId, pathname, router],
  );

  const value = useMemo(
    () => ({ tenants, tenantId, setTenantId, loading, error }),
    [tenants, tenantId, setTenantId, loading, error],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

/**
 * Reads the active tenant context for review UI pages.
 *
 * @returns Tenant context value.
 * @throws Error when used outside TenantProvider.
 */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return ctx;
}
