type Ticket = {
  id: number;
  subject: string;
  status: string;
  created_at: string;
};

type Message = {
  id: number;
  ticket_id: number;
  sender_type: string;
  body: string;
  created_at: string;
};

async function fetchTicket(id: string): Promise<Ticket> {
  const res = await fetch(`http://localhost:8000/tickets/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch ticket");
  return res.json();
}

async function fetchMessages(id: string): Promise<Message[]> {
  const res = await fetch(`http://localhost:8000/tickets/${id}/messages`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

export default async function TicketPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const ticket = await fetchTicket(id);
  const messages = await fetchMessages(id);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <a href="/inbox">← Back to Inbox</a>

      <h1 style={{ fontSize: 26, marginTop: 10 }}>{ticket.subject}</h1>
      <p style={{ opacity: 0.8 }}>
        #{ticket.id} • {ticket.status} • {ticket.created_at}
      </p>

      <h2 style={{ fontSize: 18, marginTop: 20 }}>Messages</h2>

      {messages.length === 0 ? (
        <p>No messages yet.</p>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {messages.map((m) => (
            <li key={m.id} style={{ marginBottom: 10 }}>
              <div>
                <b>{m.sender_type}</b>: {m.body}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{m.created_at}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
