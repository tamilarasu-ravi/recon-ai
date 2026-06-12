import { defineConfig } from "drizzle-kit";

/** Migrations 0002–0009 are hand-maintained SQL. Avoid `pnpm db:generate` unless meta snapshots are in sync — it can emit a full squash (0010_*) that duplicates enums. */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/cfo_capstone",
  },
});
