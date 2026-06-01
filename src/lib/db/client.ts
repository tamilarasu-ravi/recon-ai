import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type PostgresClient = ReturnType<typeof postgres>;

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
  const client = postgres(url, {
    max: isServerless ? 1 : 10,
    // Required when using Neon/Vercel pooler (PgBouncer transaction mode).
    prepare: isServerless ? false : undefined,
  });
  managedClients.push(client);
  return drizzle(client, { schema });
}

export type DbClient = ReturnType<typeof createDb>;

/** Singleton used by API routes and scripts in dev. */
let dbSingleton: DbClient | undefined;

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
