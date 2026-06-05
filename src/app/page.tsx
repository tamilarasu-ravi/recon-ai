import Link from "next/link";

import { PageLayout } from "@/app/components/page-layout";
import { TenantMetricsPanel } from "@/app/components/tenant-metrics-panel";

const PLATFORM_MODULES = [
  {
    name: "Close tagging",
    status: "Live",
    statusClass: "badge--auto",
    description: "Rule-first + RAG + LLM tri-state decisions, overrides → vendor rules, full audit.",
  },
  {
    name: "Policy gates",
    status: "Live",
    statusClass: "badge--auto",
    description: "Compiled rules and receipt gate before AUTO_TAG; policy version on every txn.",
  },
  {
    name: "Review & HITL",
    status: "Live",
    statusClass: "badge--auto",
    description: "Review queue, transaction drill-down, receipt upload, reprocess, AUTO_TAG approval.",
  },
  {
    name: "Orchestrator",
    status: "Live",
    statusClass: "badge--auto",
    description: "LangGraph workflows with Postgres checkpoints and graph-step observability.",
  },
  {
    name: "Accounts payable",
    status: "Live",
    statusClass: "badge--auto",
    description: "AP inbox UI, recommend-only graph, duplicate detection.",
  },
  {
    name: "Policy admin",
    status: "Live",
    statusClass: "badge--auto",
    description: "View/add/remove compiled rules on the active policy pack.",
  },
  {
    name: "API keys",
    status: "Live",
    statusClass: "badge--auto",
    description: "Tenant-scoped Bearer keys; optional REQUIRE_API_AUTH on server.",
  },
  {
    name: "ERP integrations",
    status: "Beta",
    statusClass: "badge--reason",
    description: "Mock sandbox posts AUTO_TAG to ERP with external id on transaction.",
  },
] as const;

/**
 * Product home hub — modules, navigation, and API entry points.
 *
 * @returns Home page.
 */
export default function HomePage(): React.ReactElement {
  return (
    <PageLayout
      title="Financial operations platform"
      subtitle="Event-driven close tagging, policy enforcement, and payables — one orchestrator, shared audit, agent-native APIs."
    >
      <section className="hero">
        <span className="hero__eyebrow">ReconAI v0.1</span>
        <div className="hero__pipelines">
          <span className="hero__pipe">LangGraph orchestrator</span>
          <span className="hero__pipe">Tri-state autonomy</span>
          <span className="hero__pipe">MCP + REST</span>
          <span className="hero__pipe">Eval-gated releases</span>
        </div>
        <p style={{ margin: "1rem 0 0", fontSize: "0.9375rem", color: "var(--color-text-muted)", maxWidth: "42rem" }}>
          New here? <Link href="/review-queue/new">Add a sample transaction</Link> with tenant-aware
          presets — or read <code>docs/production-roadmap.md</code> for deploy checklists.
        </p>
      </section>

      <TenantMetricsPanel />

      <div className="card-grid">
        <Link href="/review-queue" className="card card--link">
          <h2 className="card__title">Review queue</h2>
          <p className="card__desc">
            Open items awaiting accountant action — filter by status, paginate, drill into why &
            override.
          </p>
        </Link>
        <Link href="/ap" className="card card--link">
          <h2 className="card__title">AP inbox</h2>
          <p className="card__desc">
            Invoices, pay-date recommendations, duplicate refusal — recommend-only workflow.
          </p>
        </Link>
        <Link href="/policy" className="card card--link">
          <h2 className="card__title">Policy admin</h2>
          <p className="card__desc">
            View and edit compiled rules on the active policy pack (receipt, caps, MCC).
          </p>
        </Link>
        <Link href="/orchestrator" className="card card--link">
          <h2 className="card__title">Orchestrator</h2>
          <p className="card__desc">
            Live LangGraph topology — policy → tagging and AP workflows with HITL checkpoints.
          </p>
        </Link>
        <Link href="/review-queue/new" className="card card--link">
          <h2 className="card__title">Add transaction</h2>
          <p className="card__desc">
            Ingest a card transaction with seeded presets — receipt gate, vendor rules, unknown
            vendor, and policy flags.
          </p>
        </Link>
        <Link href="/settings" className="card card--link">
          <h2 className="card__title">Settings</h2>
          <p className="card__desc">
            API keys for programmatic access and ERP sandbox configuration.
          </p>
        </Link>
        <div className="card">
          <h2 className="card__title">Quality gates</h2>
          <p className="card__desc">
            <code>pnpm production:check</code> — prod env validation.{" "}
            <code>pnpm showcase:prep</code> — tests + eval + build.{" "}
            <code>GET /api/ready</code> — deploy readiness.
          </p>
        </div>
      </div>

      <section className="panel" style={{ marginTop: "2rem" }}>
        <h2 className="panel__title">Platform modules</h2>
        <ul className="queue-list" style={{ listStyle: "none", padding: 0 }}>
          {PLATFORM_MODULES.map((mod) => (
            <li key={mod.name} className="queue-item" style={{ marginBottom: "0.75rem" }}>
              <div className="queue-item__header">
                <span className="queue-item__vendor">{mod.name}</span>
                <span className={`badge ${mod.statusClass}`}>{mod.status}</span>
              </div>
              <p className="queue-item__meta" style={{ margin: "0.35rem 0 0" }}>
                {mod.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel panel--muted" style={{ marginTop: "1.25rem" }}>
        <h2 className="panel__title">API surface</h2>
        <ul className="api-list">
          <li>
            <code>GET /api/health</code> — service status
          </li>
          <li>
            <code>POST /api/ingest/transactions</code> — ingest &amp; run tagging graph (
            <code>?async=true</code> returns 202; poll{" "}
            <code>GET /api/transactions/[id]/status</code>)
          </li>
          <li>
            <code>POST /api/ingest/invoices</code> — AP graph (recommend-only)
          </li>
          <li>
            <code>GET /api/review-queue?tenant_id=…</code> — cursor-paginated queue
          </li>
          <li>
            <code>GET /api/transactions/[id]?tenant_id=…</code> — detail, audit, graph steps
          </li>
        </ul>
      </section>
    </PageLayout>
  );
}
