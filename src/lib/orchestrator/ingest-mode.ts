/**
 * Returns true when the ingest request should enqueue tagging and return immediately.
 *
 * @param request - Incoming HTTP request (query `async=true` or `Prefer: respond-async`).
 * @returns Whether async ingest mode is active for this request.
 */
export function isAsyncIngestRequest(request: Request): boolean {
  const url = new URL(request.url);
  const asyncParam = url.searchParams.get("async")?.trim().toLowerCase();
  if (asyncParam === "true" || asyncParam === "1") {
    return true;
  }
  if (asyncParam === "false" || asyncParam === "0") {
    return false;
  }

  const prefer = request.headers.get("prefer")?.toLowerCase() ?? "";
  if (prefer.includes("respond-async")) {
    return true;
  }

  return process.env.INGEST_ASYNC_DEFAULT?.trim().toLowerCase() === "true";
}
