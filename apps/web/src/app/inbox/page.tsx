type Ticket = {
  id: number;
  subject: string;
  status: string;
  created_at: string;
};

async function fetchTickets(): Promise<Ticket[]> {
  const res = await fetch("http://localhost:8000/tickets", {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch tickets");
  }

  return res.json();
}

export default async function InboxPage() {
  const tickets = await fetchTickets();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Inbox</h1>

      <p style={{ marginBottom: 16, opacity: 0.8 }}>
        Tickets loaded from FastAPI: <b>{tickets.length}</b>
      </p>

      {tickets.length === 0 ? (
        <p>No tickets yet. Create one in the API docs.</p>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {tickets.map((t) => (
            <li key={t.id} style={{ marginBottom: 10 }}>
              <a href={`/inbox/${t.id}`}>
                <b>#{t.id}</b> — {t.subject}
              </a>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                status: {t.status} • created: {t.created_at}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
