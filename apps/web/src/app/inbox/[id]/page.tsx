type Ticket = {
  id: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  assignee: string | null;
  due_at: string | null;
  created_at: string;
};

type Message = {
  id: number;
  ticket_id: number;
  sender_type: string;
  body: string;
  created_at: string;
};

const API_BASE = "http://127.0.0.1:8000";

async function fetchTicket(id: string): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/tickets/${id}`, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch ticket: ${res.status} ${text}`);
  }

  return res.json();
}

async function fetchMessages(id: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/tickets/${id}/messages`, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch messages: ${res.status} ${text}`);
  }

  return res.json();
}

function getAssignees(): string[] {
  const raw = process.env.NEXT_PUBLIC_ASSIGNEES || "Sumana";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- Server Actions ---
async function assignTicket(ticketId: string, assignee: string) {
  "use server";
  const res = await fetch(`${API_BASE}/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignee }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to assign ticket: ${res.status} ${text}`);
  }
}

async function closeTicket(ticketId: string) {
  "use server";
  const res = await fetch(`${API_BASE}/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "closed" }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to close ticket: ${res.status} ${text}`);
  }
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // ✅ Next 16: params is a Promise — unwrap once
  const p = await params;

  const ticket = await fetchTicket(p.id);
  const messages = await fetchMessages(p.id);
  const assignees = getAssignees();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 800 }}>
      <a href="/inbox">← Back to Inbox</a>

      <h1 style={{ fontSize: 26, marginTop: 10 }}>{ticket.subject}</h1>

      <div style={{ marginTop: 8, opacity: 0.85 }}>
        <div>
          <b>Ticket:</b> #{ticket.id}
        </div>
        <div>
          <b>Status:</b> {ticket.status} • <b>Priority:</b> {ticket.priority} •{" "}
          <b>Category:</b> {ticket.category}
        </div>
        <div>
          <b>Assignee:</b> {ticket.assignee ?? "-"}
        </div>
      </div>

      {/* Actions */}
      <section
        style={{
          marginTop: 16,
          padding: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
        }}
      >
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Actions</h2>

        {/* Assign */}
        <form
          action={async (formData) => {
            "use server";
            const assignee = String(formData.get("assignee") || "").trim();
            if (!assignee) return;
            await assignTicket(p.id, assignee);
          }}
          style={{ display: "flex", gap: 10, alignItems: "center" }}
        >
          <label htmlFor="assignee">
            <b>Assign:</b>
          </label>

          <select
            id="assignee"
            name="assignee"
            defaultValue={ticket.assignee ?? assignees[0] ?? "Sumana"}
            style={{ padding: 8 }}
          >
            {assignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <button type="submit" style={{ padding: "8px 12px" }}>
            Assign
          </button>
        </form>

        {/* Close */}
        <form
          action={async () => {
            "use server";
            await closeTicket(p.id);
          }}
          style={{ marginTop: 12 }}
        >
          <button
            type="submit"
            disabled={ticket.status === "closed"}
            style={{ padding: "8px 12px" }}
          >
            {ticket.status === "closed" ? "Already Closed" : "Close Ticket"}
          </button>
        </form>
      </section>

      {/* Messages */}
      <h2 style={{ fontSize: 18, marginTop: 22 }}>Messages</h2>

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
