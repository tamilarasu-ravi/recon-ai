ALTER TYPE "public"."processing_status" ADD VALUE IF NOT EXISTS 'dead_letter';--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "processing_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "processing_last_error" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "processing_next_retry_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_processing_retry_idx" ON "transactions" USING btree ("processing_status","processing_next_retry_at");
