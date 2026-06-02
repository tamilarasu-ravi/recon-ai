import { z } from "zod";

import type { AppEnv } from "@/lib/config/env";
import type { DbClient } from "@/lib/db/client";

export const taggingGraphContextSchema = z.object({
  db: z.custom<DbClient>(),
  env: z.custom<AppEnv>(),
  skipPolicy: z.boolean().default(false),
  hitlEnabled: z.boolean().default(false),
  mode: z.enum(["ingest", "reprocess"]).default("ingest"),
});

export type TaggingGraphContext = z.infer<typeof taggingGraphContextSchema>;

export const apGraphContextSchema = z.object({
  db: z.custom<DbClient>(),
});

export type ApGraphContext = z.infer<typeof apGraphContextSchema>;
