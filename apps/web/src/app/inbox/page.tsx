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

const API_BASE = "http://127.0.0.1:8000";

async function fetchTickets(
  sp: Record<string, string | undefined>
): Promise<Ticket[]> {
  const qs = new URLSearchParams();

  if (sp.status) qs.set("status", sp.status);
  if (sp.priority) qs.set("priority", sp.priority);
  if (sp.category) qs.set("category", sp.category);
  if (sp.assignee) qs.set("assignee", sp.assignee);

  const url =
    qs.toString().length > 0
      ? `${API_BASE}/tickets?${qs.toString()}`
      : `${API_BASE}/tickets`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch tickets");

  return res.json();
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // ✅ Next 16: unwrap searchParams ONCE
  const sp = await searchParams;

  const tickets = await fetchTickets(sp);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Inbox</h1>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          fontSize: 14,
        }}
      >
        <a href="/inbox">All</a>
        <a href="/inbox?status=open">Open</a>
        <a href="/inbox?priority=high">High Priority</a>
        <a href="/inbox?category=billing">Billing</a>
        <a href="/inbox?category=login">Login</a>
      </div>

      <p style={{ marginBottom: 16, opacity: 0.8 }}>
        Tickets loaded from FastAPI: <b>{tickets.length}</b>
      </p>

      {tickets.length === 0 ? (
        <p>No tickets match the current filters.</p>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {tickets.map((t) => (
            <li key={t.id} style={{ marginBottom: 14 }}>
              <div>
                <a href={`/inbox/${t.id}`}>
                  <b>#{t.id}</b> — {t.subject}
                </a>
              </div>

              <div style={{ fontSize: 12, opacity: 0.75 }}>
                status: {t.status} • priority: {t.priority} • category:{" "}
                {t.category}
              </div>

              <div style={{ fontSize: 12, opacity: 0.75 }}>
                assignee: {t.assignee ?? "-"} • created: {t.created_at}
              </div>

              {t.due_at && (
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  due by: {t.due_at}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
