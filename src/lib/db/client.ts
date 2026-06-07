import { AsyncLocalStorage } from "node:async_hooks";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  isCloudflareRuntime,
  isHyperdriveConnectionString,
  resolveDatabaseConnectionString,
} from "@/lib/db/resolve-connection-string";
import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;

interface RlsDbScope {
  client: DbClient;
}

const rlsDbScope = new AsyncLocalStorage<RlsDbScope>();

/** Script-scoped postgres clients — closed by closeDb() so CLI exits cleanly. */
const managedClients: PostgresClient[] = [];

/**
 * Returns a Drizzle database client bound to the application schema.
 *
 * @param connectionString - Postgres URL (defaults to DATABASE_URL env var).
 * @returns Drizzle client for queries and transactions.
 * @throws Error if connectionString is missing and DATABASE_URL is unset.
 */
export function createDb(connectionString?: string) {
  const url = connectionString ?? resolveDatabaseConnectionString();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required (or configure a Cloudflare Hyperdrive binding named HYPERDRIVE)",
    );
  }

  const viaHyperdrive = isHyperdriveConnectionString(url);
  const isServerless = Boolean(process.env.VERCEL) || isCloudflareRuntime() || viaHyperdrive;
  const client = postgres(url, {
    max: isServerless ? 1 : 10,
    // Required when using Neon/Vercel pooler (PgBouncer transaction mode).
    prepare: isServerless ? false : undefined,
    // Hyperdrive terminates TLS to Neon; the Worker→Hyperdrive hop is plain TCP.
    ssl: viaHyperdrive ? false : undefined,
  });
  managedClients.push(client);
  return drizzle(client, { schema });
}

type RootDbClient = ReturnType<typeof createDb>;

/** Drizzle transaction handle — used for RLS-scoped work inside `runWithTenantRls`. */
export type DbTransaction = Parameters<Parameters<RootDbClient["transaction"]>[0]>[0];

/** Root pool or RLS transaction — use for all repository and orchestrator DB parameters. */
export type DbClient = RootDbClient | DbTransaction;

/** Singleton used by API routes and scripts in dev. */
let dbSingleton: RootDbClient | undefined;

/**
 * Closes all postgres clients opened via createDb (allows CLI scripts to exit).
 *
 * @returns Promise that resolves when connections are drained.
 */
export async function closeDb(): Promise<void> {
  await Promise.all(managedClients.map((client) => client.end({ timeout: 5 })));
  managedClients.length = 0;
  dbSingleton = undefined;
}

/**
 * Returns the root pooled client (not RLS-scoped).
 *
 * @returns Shared Drizzle client instance.
 */
export function getRootDb(): RootDbClient {
  if (!dbSingleton) {
    dbSingleton = createDb();
  }
  return dbSingleton;
}

/**
 * Runs a callback with getDb() bound to a specific client (e.g. RLS transaction).
 *
 * @param client - Scoped Drizzle client.
 * @param fn - Work executed under the scope.
 * @returns Result of the callback.
 */
export function runInRlsDbScope<T>(client: DbClient, fn: () => Promise<T>): Promise<T> {
  return rlsDbScope.run({ client }, fn);
}

/**
 * Lazily initializes and returns the database client for the current async context.
 *
 * @returns RLS-scoped transaction client when inside runWithTenantRls, else root pool.
 */
export function getDb(): DbClient {
  return rlsDbScope.getStore()?.client ?? getRootDb();
}

export { schema };
