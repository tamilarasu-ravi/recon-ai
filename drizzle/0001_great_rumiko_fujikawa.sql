ALTER TABLE "transactions" ADD COLUMN "gl_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "suggested_gl_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tagging_decision" "tagging_decision";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "confidence" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tax_code" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "dimensions" jsonb;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_gl_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_suggested_gl_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("suggested_gl_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_tenant_labeled_gl_idx" ON "transactions" USING btree ("tenant_id","gl_account_id");