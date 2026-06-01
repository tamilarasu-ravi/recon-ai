import Link from "next/link";

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "1.25rem",
  display: "block",
  textDecoration: "none",
  color: "inherit",
};

/**
 * Capstone home hub — links to review UI and API docs paths.
 *
 * @returns Home page.
 */
export default function HomePage(): React.ReactElement {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>ReconAI Financial Operations Platform</h1>
      <p>
        Event-driven CFO ops: <strong>tagging</strong> (hero), <strong>policy</strong> gate,{" "}
        <strong>AP</strong> recommend-only.
      </p>

      <div style={{ display: "grid", gap: "1rem", marginTop: "2rem" }}>
        <Link href="/review-queue" style={cardStyle}>
          <strong>Review queue</strong>
          <p style={{ margin: "0.5rem 0 0", color: "#555", fontSize: "0.9rem" }}>
            Open items, reason chips, drill-down to why + override.
          </p>
        </Link>
        <div style={cardStyle}>
          <strong>CLI demo</strong>
          <p style={{ margin: "0.5rem 0 0", color: "#555", fontSize: "0.9rem" }}>
            <code>pnpm demo</code> — full E2E (policy → receipt → tag → override → AP).
          </p>
        </div>
      </div>

      <h2 style={{ marginTop: "2.5rem", fontSize: "1rem" }}>API (showcase)</h2>
      <ul style={{ fontSize: "0.9rem", color: "#444" }}>
        <li>
          <code>GET /api/health</code>
        </li>
        <li>
          <code>POST /api/ingest/transactions</code>
        </li>
        <li>
          <code>GET /api/review-queue?tenant_id=…</code>
        </li>
        <li>
          <code>GET /api/transactions/[id]?tenant_id=…</code>
        </li>
      </ul>
      <p style={{ fontSize: "0.875rem", color: "#666" }}>
        Script: <code>docs/demo-script.md</code> · Eval: <code>docs/eval-results.md</code>
      </p>
    </main>
  );
}
