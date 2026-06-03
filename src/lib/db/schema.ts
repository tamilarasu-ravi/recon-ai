import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** pgvector column — dimension from EMBEDDING_DIMENSIONS (768 Google, 1536 OpenAI). */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(",")
      .filter(Boolean)
      .map(Number);
  },
});

export const processingStatusEnum = pgEnum("processing_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const taggingDecisionEnum = pgEnum("tagging_decision", [
  "AUTO_TAG",
  "QUEUE_REVIEW",
  "REFUSE",
]);

export const policyOutcomeEnum = pgEnum("policy_outcome", [
  "ALLOW",
  "FLAG_RECEIPT",
  "FLAG_REVIEW",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chartOfAccounts = pgTable(
  "chart_of_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    glCode: text("gl_code").notNull(),
    glName: text("gl_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("chart_of_accounts_tenant_id_idx").on(table.tenantId),
    uniqueIndex("chart_of_accounts_tenant_gl_code_uidx").on(table.tenantId, table.glCode),
  ],
);

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    canonicalName: text("canonical_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("vendors_tenant_id_idx").on(table.tenantId),
    uniqueIndex("vendors_tenant_canonical_name_uidx").on(table.tenantId, table.canonicalName),
  ],
);

export const vendorAliases = pgTable(
  "vendor_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    aliasRaw: text("alias_raw").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("vendor_aliases_tenant_id_idx").on(table.tenantId),
    uniqueIndex("vendor_aliases_tenant_alias_uidx").on(table.tenantId, table.aliasRaw),
  ],
);

export const vendorRules = pgTable(
  "vendor_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    glAccountId: uuid("gl_account_id")
      .notNull()
      .references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    taxCode: text("tax_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("vendor_rules_tenant_id_idx").on(table.tenantId),
    uniqueIndex("vendor_rules_tenant_vendor_uidx").on(table.tenantId, table.vendorId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    externalTransactionId: text("external_transaction_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    transactionTimestamp: timestamp("transaction_timestamp", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    vendorRaw: text("vendor_raw").notNull(),
    memo: text("memo"),
    mcc: text("mcc"),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    glAccountId: uuid("gl_account_id").references(() => chartOfAccounts.id, {
      onDelete: "set null",
    }),
    suggestedGlAccountId: uuid("suggested_gl_account_id").references(() => chartOfAccounts.id, {
      onDelete: "set null",
    }),
    taggingDecision: taggingDecisionEnum("tagging_decision"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    taxCode: text("tax_code"),
    dimensions: jsonb("dimensions"),
    processingStatus: processingStatusEnum("processing_status").notNull().default("pending"),
    erpProvider: text("erp_provider"),
    erpExternalId: text("erp_external_id"),
    erpPostedAt: timestamp("erp_posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("transactions_tenant_id_idx").on(table.tenantId),
    index("transactions_tenant_labeled_gl_idx").on(table.tenantId, table.glAccountId),
    uniqueIndex("transactions_tenant_idempotency_uidx").on(table.tenantId, table.idempotencyKey),
    uniqueIndex("transactions_tenant_external_txn_uidx").on(
      table.tenantId,
      table.externalTransactionId,
    ),
  ],
);

export const transactionEmbeddings = pgTable(
  "transaction_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    embedding: vector("embedding").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("transaction_embeddings_tenant_id_idx").on(table.tenantId),
    uniqueIndex("transaction_embeddings_transaction_uidx").on(table.transactionId),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    runId: uuid("run_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_tenant_id_idx").on(table.tenantId),
    index("events_run_id_idx").on(table.runId),
    index("events_event_type_idx").on(table.eventType),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(),
    agent: text("agent").notNull(),
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    invoiceId: uuid("invoice_id"),
    decision: taggingDecisionEnum("decision"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    policyVersion: text("policy_version"),
    observability: jsonb("observability").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_tenant_id_idx").on(table.tenantId),
    index("audit_log_run_id_idx").on(table.runId),
  ],
);

export const reviewQueue = pgTable(
  "review_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("open"),
    runId: uuid("run_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("review_queue_tenant_id_idx").on(table.tenantId),
    index("review_queue_status_idx").on(table.status),
  ],
);

export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    policyVersion: text("policy_version").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("policies_tenant_id_idx").on(table.tenantId),
    uniqueIndex("policies_tenant_version_uidx").on(table.tenantId, table.policyVersion),
  ],
);

export const policyRules = pgTable(
  "policy_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => policies.id, { onDelete: "cascade" }),
    ruleType: text("rule_type").notNull(),
    ruleConfig: jsonb("rule_config").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("policy_rules_tenant_id_idx").on(table.tenantId)],
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    receiptText: text("receipt_text"),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("receipts_tenant_id_idx").on(table.tenantId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    externalInvoiceId: text("external_invoice_id").notNull(),
    vendorRaw: text("vendor_raw").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("invoices_tenant_id_idx").on(table.tenantId),
    uniqueIndex("invoices_tenant_external_uidx").on(table.tenantId, table.externalInvoiceId),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_keys_tenant_id_idx").on(table.tenantId),
    uniqueIndex("api_keys_key_hash_uidx").on(table.keyHash),
  ],
);

export const erpConnections = pgTable(
  "erp_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    realmId: text("realm_id"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("erp_connections_tenant_id_idx").on(table.tenantId),
    uniqueIndex("erp_connections_tenant_provider_uidx").on(table.tenantId, table.provider),
  ],
);

export const webhookSecrets = pgTable(
  "webhook_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    secretPrefix: text("secret_prefix").notNull(),
    /** Server-only signing material for HMAC verification — never returned by list APIs. */
    signingSecret: text("signing_secret").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("webhook_secrets_tenant_id_idx").on(table.tenantId)],
);

export const apRecommendations = pgTable(
  "ap_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    recommendedPayDate: timestamp("recommended_pay_date", { withTimezone: true }).notNull(),
    fundingSource: text("funding_source").notNull(),
    rationale: text("rationale"),
    runId: uuid("run_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ap_recommendations_tenant_id_idx").on(table.tenantId)],
);
