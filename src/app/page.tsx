export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 }}>
      <h1>ReconAI Financial Operations Platform</h1>
      <p>Capstone scaffold — Phase A foundation.</p>
      <ul>
        <li>
          Health: <code>/api/health</code>
        </li>
        <li>
          Ingest (skeleton): <code>POST /api/ingest/transactions</code>
        </li>
      </ul>
    </main>
  );
}
