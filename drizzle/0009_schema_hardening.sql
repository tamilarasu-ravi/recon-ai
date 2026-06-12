DO $$ BEGIN
 CREATE TYPE "public"."review_queue_status" AS ENUM('open', 'resolved');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (
   SELECT 1
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'review_queue'
     AND column_name = 'status'
     AND udt_name <> 'review_queue_status'
 ) THEN
   ALTER TABLE "review_queue" ALTER COLUMN "status" DROP DEFAULT;
   ALTER TABLE "review_queue" ALTER COLUMN "status" TYPE "review_queue_status" USING "status"::"review_queue_status";
 END IF;
END $$;--> statement-breakpoint
ALTER TABLE "review_queue" ALTER COLUMN "status" SET DEFAULT 'open'::"review_queue_status";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_queue_transaction_id_idx" ON "review_queue" USING btree ("transaction_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
