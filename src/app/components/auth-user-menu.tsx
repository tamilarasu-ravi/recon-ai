"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";

/**
 * Clerk sign-in control shown in the header when SSO is configured.
 * Renders nothing when Clerk env vars are absent (local dev without SSO).
 *
 * @returns User menu, sign-in button, or null.
 */
export function AuthUserMenu(): React.ReactElement | null {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  if (!publishableKey) {
    return null;
  }

  return <AuthUserMenuClerk />;
}

/**
 * Inner menu that calls Clerk hooks — must render only under ClerkProvider.
 *
 * @returns User menu or sign-in button once Clerk session is loaded.
 */
function AuthUserMenuClerk(): React.ReactElement | null {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button type="button" className="btn btn--secondary" style={{ padding: "0.35rem 0.75rem" }}>
          Sign in
        </button>
      </SignInButton>
    );
  }

  return <UserButton />;
}
