import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.LANGGRAPH_CHECKPOINTER = "memory";
process.env.AUTO_TAG_HITL_ENABLED = "false";

import { resetOrchestratorCheckpointerForTests } from "@/lib/orchestrator/langgraph/checkpointer";
import { getOrchestratorGraphMetadata } from "@/lib/orchestrator/langgraph/graph-metadata";
import { getApGraph, resetApGraphForTests } from "@/lib/orchestrator/langgraph/ap-graph";
import { getTaggingGraph, resetTaggingGraphForTests } from "@/lib/orchestrator/langgraph/tagging-graph";
import { parseTaggingInterrupt } from "@/lib/orchestrator/langgraph/invoke-result";

describe("LangGraph orchestrator compile", () => {
  it("compiles tagging workflow graph", async () => {
    resetTaggingGraphForTests();
    resetOrchestratorCheckpointerForTests();
    const graph = await getTaggingGraph();
    assert.ok(graph);
    assert.equal(typeof graph.invoke, "function");
  });

  it("compiles AP workflow graph with conditional duplicate branch", async () => {
    resetApGraphForTests();
    resetOrchestratorCheckpointerForTests();
    const graph = await getApGraph();
    assert.ok(graph);
    assert.equal(typeof graph.invoke, "function");
  });

  it("exports orchestrator graph metadata with HITL node", () => {
    const metadata = getOrchestratorGraphMetadata();
    assert.equal(metadata.orchestrator, "langgraph");
    assert.equal(metadata.workflows.length, 2);
    assert.ok(metadata.workflows[0]?.nodes.includes("awaitAutoTagApproval"));
  });

  it("parses auto_tag interrupt payloads", () => {
    const payload = parseTaggingInterrupt({
      runId: "run-1",
      tenantId: "tenant",
      transactionId: "txn",
      vendorRaw: "Slack",
      memo: undefined,
      amount: "55",
      currency: "USD",
      mcc: undefined,
      policyResult: null,
      receiptBlocked: false,
      taggingResult: null,
      finalDecision: null,
      finalReason: null,
      mode: "ingest",
      graphSteps: [],
      __interrupt__: [
        {
          value: {
            type: "auto_tag_approval",
            transaction_id: "txn",
            run_id: "run-1",
            proposed_decision: "AUTO_TAG",
            confidence: 0.99,
            vendor_raw: "Slack",
            amount: "55",
            currency: "USD",
          },
        },
      ],
    });

    assert.equal(payload?.type, "auto_tag_approval");
    assert.equal(payload?.proposed_decision, "AUTO_TAG");
  });
});
