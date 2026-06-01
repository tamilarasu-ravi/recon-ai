import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

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
  const client = postgres(url, {
    max: isServerless ? 1 : 10,
    // Required when using Neon/Vercel pooler (PgBouncer transaction mode).
    prepare: isServerless ? false : undefined,
  });
  return drizzle(client, { schema });
}

export type DbClient = ReturnType<typeof createDb>;

/** Singleton used by API routes and scripts in dev. */
let dbSingleton: DbClient | undefined;

/**
 * Lazily initializes and returns the shared database client.
 *
 * @returns Shared Drizzle client instance.
 */
export function getDb(): DbClient {
  if (!dbSingleton) {
    dbSingleton = createDb();
  }
  return dbSingleton;
}

export { schema };
