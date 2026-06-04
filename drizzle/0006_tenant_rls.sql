CREATE OR REPLACE FUNCTION app_rls_tenant_match(row_tenant_id uuid) RETURNS boolean AS $$
  SELECT coalesce(current_setting('app.rls_bypass', true), '') = 'true'
    OR row_tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenants_tenant_isolation" ON "tenants" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.rls_bypass', true), '') = 'true' OR "tenants"."id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (coalesce(current_setting('app.rls_bypass', true), '') = 'true' OR "tenants"."id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "chart_of_accounts_tenant_isolation" ON "chart_of_accounts" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendors" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "vendors_tenant_isolation" ON "vendors" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "vendor_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendor_aliases" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "vendor_aliases_tenant_isolation" ON "vendor_aliases" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "vendor_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendor_rules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "vendor_rules_tenant_isolation" ON "vendor_rules" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "transactions_tenant_isolation" ON "transactions" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "transaction_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transaction_embeddings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "transaction_embeddings_tenant_isolation" ON "transaction_embeddings" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "events_tenant_isolation" ON "events" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_log_tenant_isolation" ON "audit_log" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "review_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "review_queue" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "review_queue_tenant_isolation" ON "review_queue" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "policies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "policies_tenant_isolation" ON "policies" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "policy_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "policy_rules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "policy_rules_tenant_isolation" ON "policy_rules" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "receipts_tenant_isolation" ON "receipts" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoices_tenant_isolation" ON "invoices" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_keys_tenant_isolation" ON "api_keys" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "erp_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_connections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "erp_connections_tenant_isolation" ON "erp_connections" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "webhook_secrets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_secrets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "webhook_secrets_tenant_isolation" ON "webhook_secrets" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));--> statement-breakpoint
ALTER TABLE "ap_recommendations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ap_recommendations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ap_recommendations_tenant_isolation" ON "ap_recommendations" AS PERMISSIVE FOR ALL TO public USING (app_rls_tenant_match(tenant_id)) WITH CHECK (app_rls_tenant_match(tenant_id));
