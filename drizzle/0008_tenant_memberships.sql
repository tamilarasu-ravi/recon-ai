CREATE TYPE "tenant_role" AS ENUM ('admin', 'accountant', 'viewer');--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" "tenant_role" DEFAULT 'accountant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_memberships_user_tenant_uidx" ON "tenant_memberships" USING btree ("clerk_user_id","tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_memberships_clerk_user_id_idx" ON "tenant_memberships" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "tenant_memberships_tenant_id_idx" ON "tenant_memberships" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_memberships_bypass_only" ON "tenant_memberships" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.rls_bypass', true), '') = 'true') WITH CHECK (coalesce(current_setting('app.rls_bypass', true), '') = 'true');
