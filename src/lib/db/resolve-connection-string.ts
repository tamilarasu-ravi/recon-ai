/** Hyperdrive binding shape from Cloudflare Workers. */
interface HyperdriveBinding {
  connectionString: string;
}

/**
 * Returns true when the process appears to be running on Cloudflare Workers/Pages.
 *
 * @returns Whether Cloudflare runtime env flags are present.
 */
export function isCloudflareRuntime(): boolean {
  return (
    process.env.CF_PAGES === "1" ||
    Boolean(process.env.CLOUDFLARE_DEPLOYMENT_ID) ||
    Boolean(process.env.CLOUDFLARE_WORKER)
  );
}

/**
 * Reads the Hyperdrive connection string from the OpenNext Cloudflare request context.
 *
 * @returns Hyperdrive URL when the binding is available in the current request.
 */
function resolveHyperdriveConnectionString(): string | undefined {
  try {
    // Optional at build time — required on Cloudflare Workers deploys using OpenNext.
    const openNext = require("@opennextjs/cloudflare") as {
      getCloudflareContext?: () => { env?: Record<string, unknown> };
    };
    const getContext = openNext.getCloudflareContext;
    if (typeof getContext !== "function") {
      return undefined;
    }

    const { env } = getContext();
    const hyperdrive = env?.HYPERDRIVE as HyperdriveBinding | undefined;
    return hyperdrive?.connectionString?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the Postgres connection string for the current runtime.
 * Priority: DATABASE_URL env → Hyperdrive binding → wrangler local Hyperdrive env.
 *
 * @returns Connection string when configured, otherwise undefined.
 */
export function resolveDatabaseConnectionString(): string | undefined {
  const explicit = process.env.DATABASE_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const fromBinding = resolveHyperdriveConnectionString();
  if (fromBinding) {
    return fromBinding;
  }

  const localHyperdrive = process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE?.trim();
  if (localHyperdrive) {
    return localHyperdrive;
  }

  return undefined;
}

/**
 * Returns true when the URL targets Cloudflare Hyperdrive's local proxy (not Neon directly).
 *
 * @param connectionString - Postgres URL in use.
 * @returns Whether TLS to the origin should be skipped for the driver hop.
 */
export function isHyperdriveConnectionString(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}
