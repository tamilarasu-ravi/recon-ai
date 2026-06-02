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

import { apiFetch } from "@/lib/ui/api-fetch";

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
  /** Reloads tenant list after API key is saved (e.g. from Settings). */
  reloadTenants: () => Promise<void>;
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

  const loadTenants = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/tenants");
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? `Failed to load tenants (${response.status})`);
      }
      const data = (await response.json()) as { tenants: TenantOption[] };

      setTenants(data.tenants);
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const defaultTenant = data.tenants.find((t) => t.slug === "tenant-a") ?? data.tenants[0];
      const initial =
        stored && data.tenants.some((t) => t.id === stored) ? stored : defaultTenant?.id ?? null;
      setTenantIdState(initial);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenants");
      setTenants([]);
      setTenantIdState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

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
    () => ({ tenants, tenantId, setTenantId, loading, error, reloadTenants: loadTenants }),
    [tenants, tenantId, setTenantId, loading, error, loadTenants],
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
