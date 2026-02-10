"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

type AuditLog = {
  id: number;
  ticket_id: number;
  actor: string;
  action: string;
  meta_json: string | null;
  created_at: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

function getAssignees(): string[] {
  const raw = process.env.NEXT_PUBLIC_ASSIGNEES || "Sumana";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatSla(dueAt: string | null) {
  if (!dueAt) return "no SLA";

  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffMs = due - now;

  const abs = Math.abs(diffMs);
  const mins = Math.floor(abs / (60 * 1000));
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  const pretty =
    days > 0 ? `${days}d ${hrs % 24}h` : hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;

  if (diffMs < 0) return `overdue by ${pretty}`;
  return `due in ${pretty}`;
}

export default function TicketPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const ticketId = params?.id;

  const [sessionChecked, setSessionChecked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const assignees = useMemo(() => getAssignees(), []);

  // 1) Get session + token
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || null;

      setAccessToken(token);
      setSessionChecked(true);

      if (!token) {
        router.push("/login");
        return;
      }
    })();
  }, [router]);

  // 2) Fetch all data for this ticket
  useEffect(() => {
    if (!sessionChecked) return;
    if (!accessToken) return;
    if (!ticketId) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const headers = { Authorization: `Bearer ${accessToken}` };

        const [tRes, mRes, aRes] = await Promise.all([
          fetch(`${API_BASE}/tickets/${ticketId}`, { cache: "no-store", headers }),
          fetch(`${API_BASE}/tickets/${ticketId}/messages`, { cache: "no-store", headers }),
          fetch(`${API_BASE}/tickets/${ticketId}/audit`, { cache: "no-store", headers }),
        ]);

        if (!tRes.ok) throw new Error(`Ticket fetch failed: ${tRes.status} ${await tRes.text()}`);
        if (!mRes.ok) throw new Error(`Messages fetch failed: ${mRes.status} ${await mRes.text()}`);
        if (!aRes.ok) throw new Error(`Audit fetch failed: ${aRes.status} ${await aRes.text()}`);

        const t = (await tRes.json()) as Ticket;
        const m = (await mRes.json()) as Message[];
        const a = (await aRes.json()) as AuditLog[];

        setTicket(t);
        setMessages(m);
        setAudit(a);
      } catch (e: any) {
        setErr(e.message || "Failed to load ticket");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionChecked, accessToken, ticketId]);

  async function apiPatch(body: any) {
    if (!accessToken || !ticketId) return;

    const res = await fetch(`${API_BASE}/tickets/${ticketId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text}`);
    }

    // refresh ticket + audit after patch
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [tRes, aRes] = await Promise.all([
      fetch(`${API_BASE}/tickets/${ticketId}`, { cache: "no-store", headers }),
      fetch(`${API_BASE}/tickets/${ticketId}/audit`, { cache: "no-store", headers }),
    ]);

    if (tRes.ok) setTicket((await tRes.json()) as Ticket);
    if (aRes.ok) setAudit((await aRes.json()) as AuditLog[]);
  }

  async function assignTicket(assignee: string) {
    await apiPatch({ assignee });
  }

  async function closeTicket() {
    await apiPatch({ status: "closed" });
  }

  async function setSlaHours(hours: number) {
    const due = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await apiPatch({ due_at: due });
  }

  async function clearSla() {
    await apiPatch({ due_at: "" }); // your backend treats "" as clear
  }

  async function addMessage(body: string) {
    if (!accessToken || !ticketId) return;

    const res = await fetch(`${API_BASE}/tickets/${ticketId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ sender_type: "customer", body }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text}`);
    }

    // refresh messages + audit
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [mRes, aRes] = await Promise.all([
      fetch(`${API_BASE}/tickets/${ticketId}/messages`, { cache: "no-store", headers }),
      fetch(`${API_BASE}/tickets/${ticketId}/audit`, { cache: "no-store", headers }),
    ]);

    if (mRes.ok) setMessages((await mRes.json()) as Message[]);
    if (aRes.ok) setAudit((await aRes.json()) as AuditLog[]);
  }

  if (!sessionChecked) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Checking session…</main>;
  }

  if (!accessToken) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Redirecting to login…</main>;
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading ticket…</main>;
  }

  if (err) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <a href="/inbox">← Back to Inbox</a>
        <p style={{ color: "tomato", marginTop: 16 }}>Error: {err}</p>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <a href="/inbox">← Back to Inbox</a>
        <p style={{ marginTop: 16 }}>Ticket not found.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
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
        <div>
          <b>SLA:</b> {formatSla(ticket.due_at)} {ticket.due_at ? `(${ticket.due_at})` : ""}
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
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="assignee">
            <b>Assign:</b>
          </label>

          <select
            id="assignee"
            defaultValue={ticket.assignee ?? assignees[0] ?? "Sumana"}
            style={{ padding: 8 }}
            onChange={async (e) => {
              const name = e.target.value;
              try {
                await assignTicket(name);
              } catch (e: any) {
                alert(e.message || "Assign failed");
              }
            }}
          >
            {assignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <button
            onClick={async () => {
              try {
                await closeTicket();
              } catch (e: any) {
                alert(e.message || "Close failed");
              }
            }}
            disabled={ticket.status === "closed"}
            style={{ padding: "8px 12px" }}
          >
            {ticket.status === "closed" ? "Already Closed" : "Close Ticket"}
          </button>
        </div>

        {/* SLA Buttons */}
        <div style={{ marginTop: 12 }}>
          <b>Set SLA:</b>{" "}
          <button style={{ padding: "6px 10px", marginRight: 8 }} onClick={() => setSlaHours(4)}>
            +4h
          </button>
          <button style={{ padding: "6px 10px", marginRight: 8 }} onClick={() => setSlaHours(24)}>
            +24h
          </button>
          <button style={{ padding: "6px 10px", marginRight: 8 }} onClick={() => setSlaHours(72)}>
            +72h
          </button>
          <button style={{ padding: "6px 10px" }} onClick={clearSla}>
            Clear
          </button>
        </div>
      </section>

      {/* Messages */}
      <h2 style={{ fontSize: 18, marginTop: 22 }}>Messages</h2>

      <MessageComposer
        onSend={async (body) => {
          try {
            await addMessage(body);
          } catch (e: any) {
            alert(e.message || "Message failed");
          }
        }}
      />

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

      {/* Activity */}
      <h2 style={{ fontSize: 18, marginTop: 22 }}>Activity</h2>
      {audit.length === 0 ? (
        <p>No activity yet.</p>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {audit.map((a) => (
            <li key={a.id} style={{ marginBottom: 12 }}>
              <div>
                <b>{a.action}</b> — {a.actor}
              </div>
              {a.meta_json && (
                <pre
                  style={{
                    marginTop: 6,
                    padding: 10,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.06)",
                    overflowX: "auto",
                    fontSize: 12,
                  }}
                >
                  {a.meta_json}
                </pre>
              )}
              <div style={{ fontSize: 12, opacity: 0.7 }}>{a.created_at}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function MessageComposer({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [text, setText] = useState("");

  return (
    <div style={{ marginTop: 10, marginBottom: 12, display: "flex", gap: 10 }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a message..."
        style={{ flex: 1, padding: 10 }}
      />
      <button
        onClick={async () => {
          const body = text.trim();
          if (!body) return;
          setText("");
          await onSend(body);
        }}
        style={{ padding: "10px 12px" }}
      >
        Send
      </button>
    </div>
  );
}
