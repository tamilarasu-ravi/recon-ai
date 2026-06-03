/**
 * Verifies the cron/worker secret for internal maintenance routes.
 *
 * @param request - Incoming HTTP request.
 * @returns True when CRON_SECRET is configured and matches the request.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("Authorization");
  if (authHeader === `Bearer ${secret}`) {
    return true;
  }

  const cronHeader = request.headers.get("X-Cron-Secret");
  return cronHeader === secret;
}
