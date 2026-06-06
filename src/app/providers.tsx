"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

/**
 * Wraps children with Clerk when publishable key is configured at build time.
 *
 * @param props - App children.
 * @returns Provider tree.
 */
export function AppProviders({ children }: { children: ReactNode }): React.ReactElement {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  if (!publishableKey) {
    return <>{children}</>;
  }

  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}
