import { AsyncLocalStorage } from "node:async_hooks";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

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
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const isServerless = Boolean(process.env.VERCEL);
  const isPoolerUrl = url.includes("-pooler.") || url.includes("pgbouncer=true");
  const client = postgres(url, {
    max: isServerless ? 1 : 10,
    // Required for Neon/Vercel pooler (PgBouncer transaction mode).
    prepare: isServerless || isPoolerUrl ? false : undefined,
    // Rotate connections before serverless poolers drop long-lived handles (eval, seed).
    idle_timeout: isPoolerUrl ? 20 : undefined,
    max_lifetime: isPoolerUrl ? 60 * 5 : undefined,
    connect_timeout: 30,
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
