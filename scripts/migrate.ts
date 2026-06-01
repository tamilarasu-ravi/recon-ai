import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Project .env wins over shell exports (common source of wrong-port auth failures).
loadDotenv({ path: ".env", override: true });
loadDotenv({ path: ".env.local", override: true });

/**
 * Returns host, port, and database from a Postgres URL for safe logging (no password).
 *
 * @param connectionString - DATABASE_URL value
 * @returns Parsed connection parts or null when URL is invalid
 */
function describeDatabaseTarget(
  connectionString: string,
): { host: string; port: string; database: string } | null {
  try {
    const url = new URL(connectionString);
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, "") || "(default)",
    };
  } catch {
    return null;
  }
}

/**
 * Applies SQL migrations from the drizzle/ folder to the configured database.
 *
 * @returns Promise that resolves when migrations complete.
 * @throws Error when DATABASE_URL is missing or migration fails.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for db:migrate");
  }

  const target = describeDatabaseTarget(connectionString);
  if (target) {
    console.log(
      `Connecting to ${target.host}:${target.port}/${target.database} (from .env)`,
    );
    if (target.port === "5432") {
      console.warn(
        "Warning: port 5432 is usually macOS PostgreSQL, not Docker. Use 5434 for recon-ai compose.",
      );
    }
  }

  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await migrate(db, { migrationsFolder: "./drizzle" });
  await sql.end();

  console.log("Migrations applied successfully.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
