const API_KEY_STORAGE_KEY = "recon_api_key";

/**
 * Stores the API key in session storage for browser requests when auth is enabled.
 *
 * @param key - Raw API key or empty string to clear.
 */
export function setClientApiKey(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!key.trim()) {
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    return;
  }

  sessionStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
}

/**
 * Reads the API key from session storage.
 *
 * @returns Stored key or null.
 */
export function getClientApiKey(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = sessionStorage.getItem(API_KEY_STORAGE_KEY);
  return value && value.length > 0 ? value : null;
}

export interface ApiFetchOptions {
  /** When true, do not attach Authorization (bootstrap / first-key flows). */
  omitApiKey?: boolean;
}

/**
 * Fetch wrapper that attaches API key headers for same-origin API routes.
 *
 * @param input - URL or Request.
 * @param init - Standard fetch init.
 * @param options - Optional flags to skip sending a stored API key.
 * @returns Fetch response.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: ApiFetchOptions,
): Promise<Response> {
  const headers = new Headers(init?.headers);

  if (!options?.omitApiKey) {
    const apiKey = getClientApiKey();
    if (apiKey) {
      headers.set("Authorization", `Bearer ${apiKey}`);
    }
  }

  return fetch(input, { ...init, headers });
}

/**
 * Removes the browser-stored API key from sessionStorage.
 */
export function clearClientApiKey(): void {
  setClientApiKey("");
}
