/**
 * Webhooks default to async ACK unless explicitly disabled.
 *
 * @param request - Incoming webhook HTTP request.
 * @returns Whether to queue tagging and return 202.
 */
export function isAsyncWebhookIngest(request: Request): boolean {
  const url = new URL(request.url);
  const asyncParam = url.searchParams.get("async")?.trim().toLowerCase();

  if (asyncParam === "false" || asyncParam === "0") {
    return false;
  }
  if (asyncParam === "true" || asyncParam === "1") {
    return true;
  }

  return process.env.WEBHOOK_ASYNC_DEFAULT?.trim().toLowerCase() !== "false";
}
