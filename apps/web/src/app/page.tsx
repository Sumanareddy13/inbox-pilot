import Image from "next/image";

export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Inbox Pilot</h1>
      <p style={{ maxWidth: 720, lineHeight: 1.5 }}>
        AI-assisted support triage. Week 1 goal:
        ingest tickets and display an inbox view.
      </p>

      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <button style={{ padding: "10px 14px" }} disabled>
          Login (coming soon)
        </button>
        <a href="/inbox" style={{ padding: "10px 14px", border: "1px solid #999" }}>
          Go to Inbox (placeholder)
        </a>
      </div>
    </main>
  );
}

