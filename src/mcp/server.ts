import { config as loadDotenv } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createDb } from "@/lib/db/client";
import {
  handleGetReviewQueue,
  handleIngestTransaction,
  handleListTenants,
  handleReprocessTagging,
  handleSubmitOverride,
  handleUploadReceipt,
  mcpJsonResult,
} from "@/mcp/platform-handlers";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const server = new McpServer({
  name: "recon-ai-platform",
  version: "0.1.0",
});

const tenantSlugSchema = z.object({
  tenant_slug: z.string().min(1).describe("Tenant slug, e.g. tenant-a"),
});

server.registerTool(
  "list_tenants",
  {
    title: "List tenants",
    description: "Lists seeded tenants (id, slug, name) for capstone demos.",
  },
  async () => {
    const db = createDb();
    return mcpJsonResult(await handleListTenants(db));
  },
);

server.registerTool(
  "ingest_transaction",
  {
    title: "Ingest transaction",
    description: "Ingests a card transaction and runs policy + tagging orchestrator.",
    inputSchema: tenantSlugSchema.extend({
      external_transaction_id: z.string().min(1).max(128),
      transaction_timestamp: z.string().datetime(),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
      currency: z.string().length(3).default("USD"),
      vendor_raw: z.string().min(1).max(256),
      memo: z.string().max(512).optional(),
      mcc: z.string().max(8).optional(),
    }),
  },
  async (args) => {
    const db = createDb();
    return mcpJsonResult(await handleIngestTransaction(db, args));
  },
);

server.registerTool(
  "get_review_queue",
  {
    title: "Get review queue",
    description: "Lists review queue items for a tenant with transaction context.",
    inputSchema: tenantSlugSchema.extend({
      status: z.enum(["open", "resolved", "all"]).default("open"),
      limit: z.number().int().min(1).max(100).default(25),
    }),
  },
  async (args) => {
    const db = createDb();
    return mcpJsonResult(
      await handleGetReviewQueue(db, args.tenant_slug, args.status, args.limit),
    );
  },
);

server.registerTool(
  "submit_override",
  {
    title: "Submit override",
    description: "Accountant override — sets GL and creates/updates vendor_rules.",
    inputSchema: tenantSlugSchema.extend({
      transaction_id: z.string().uuid(),
      gl_code: z.string().min(1).max(16),
      tax_code: z.string().max(32).optional(),
    }),
  },
  async (args) => {
    const db = createDb();
    return mcpJsonResult(await handleSubmitOverride(db, args));
  },
);

server.registerTool(
  "upload_receipt",
  {
    title: "Upload receipt",
    description: "Uploads mock receipt text and marks receipt cleared for policy gating.",
    inputSchema: tenantSlugSchema.extend({
      transaction_id: z.string().uuid(),
      receipt_text: z.string().min(1).max(4000),
    }),
  },
  async (args) => {
    const db = createDb();
    return mcpJsonResult(await handleUploadReceipt(db, args));
  },
);

server.registerTool(
  "reprocess_tagging",
  {
    title: "Reprocess tagging",
    description: "Re-runs tagging after receipt cleared or policy state change.",
    inputSchema: tenantSlugSchema.extend({
      transaction_id: z.string().uuid(),
    }),
  },
  async (args) => {
    const db = createDb();
    return mcpJsonResult(
      await handleReprocessTagging(db, args.tenant_slug, args.transaction_id),
    );
  },
);

/**
 * Starts the ReconAI MCP server on stdio (Cursor / Claude Desktop).
 *
 * @returns Promise that resolves when transport is connected.
 */
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ReconAI MCP server running (stdio)");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
