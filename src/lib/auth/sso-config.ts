/**
 * Returns true when Clerk SSO env vars are configured.
 *
 * @returns Whether browser SSO should be enabled.
 */
export function isSsoEnabled(): boolean {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  return Boolean(secret && publishable);
}
