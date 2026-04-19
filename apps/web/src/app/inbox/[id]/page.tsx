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

  ai_category: string | null;
  ai_priority: string | null;
  ai_confidence: number | null;
  ai_entities: string | null;
  ai_status: string;
  ai_summary: string | null;
  ai_last_error: string | null;
  ai_updated_at: string | null;
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

function prettyConfidence(value: number | null) {
  if (value === null || value === undefined) return "-";
  return `${Math.round(value * 100)}%`;
}

function parseEntities(raw: string | null): string {
  if (!raw) return "-";

  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
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
  const [runningAnalysis, setRunningAnalysis] = useState(false);

  const assignees = useMemo(() => getAssignees(), []);

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

  async function loadTicketData(token: string, id: string) {
    const headers = { Authorization: `Bearer ${token}` };

    const [tRes, mRes, aRes] = await Promise.all([
      fetch(`${API_BASE}/tickets/${id}`, { cache: "no-store", headers }),
      fetch(`${API_BASE}/tickets/${id}/messages`, { cache: "no-store", headers }),
      fetch(`${API_BASE}/tickets/${id}/audit`, { cache: "no-store", headers }),
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
  }

  useEffect(() => {
    if (!sessionChecked) return;
    if (!accessToken) return;
    if (!ticketId) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        await loadTicketData(accessToken, ticketId);
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

    await loadTicketData(accessToken, ticketId);
  }

  async function runAnalysis() {
    if (!accessToken || !ticketId) return;

    try {
      setRunningAnalysis(true);

      const res = await fetch(`${API_BASE}/tickets/${ticketId}/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text}`);
      }

      await loadTicketData(accessToken, ticketId);
    } catch (e: any) {
      alert(e.message || "Analysis failed");
    } finally {
      setRunningAnalysis(false);
    }
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
    await apiPatch({ due_at: "" });
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

    await loadTicketData(accessToken, ticketId);
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
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 980 }}>
      <a href="/inbox">← Back to Inbox</a>

      <h1 style={{ fontSize: 26, marginTop: 10 }}>{ticket.subject}</h1>

      <div style={{ marginTop: 8, opacity: 0.85 }}>
        <div>
          <b>Ticket:</b> #{ticket.id}
        </div>
        <div>
          <b>Status:</b> {ticket.status} • <b>Priority:</b> {ticket.priority} • <b>Category:</b> {ticket.category}
        </div>
        <div>
          <b>Assignee:</b> {ticket.assignee ?? "-"}
        </div>
        <div>
          <b>SLA:</b> {formatSla(ticket.due_at)} {ticket.due_at ? `(${ticket.due_at})` : ""}
        </div>
      </div>

      <section
        style={{
          marginTop: 16,
          padding: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
        }}
      >
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>Actions</h2>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="assignee">
            <b>Assign:</b>
          </label>

          <select
            id="assignee"
            value={ticket.assignee ?? ""}
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
            <option value="">Unassigned</option>
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

      <section
        style={{
          marginTop: 18,
          padding: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>AI Analysis</h2>
            <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
              Stub pipeline for analysis workflow. Real async AI comes later.
            </div>
          </div>

          <button
            onClick={runAnalysis}
            disabled={runningAnalysis}
            style={{ padding: "8px 12px", fontWeight: 700 }}
          >
            {runningAnalysis ? "Analyzing..." : "Run AI Analysis"}
          </button>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div>
            <b>Status:</b> {ticket.ai_status || "pending"}
          </div>
          <div>
            <b>Suggested Category:</b> {ticket.ai_category ?? "-"}
          </div>
          <div>
            <b>Suggested Priority:</b> {ticket.ai_priority ?? "-"}
          </div>
          <div>
            <b>Confidence:</b> {prettyConfidence(ticket.ai_confidence)}
          </div>
          <div>
            <b>Summary:</b> {ticket.ai_summary ?? "-"}
          </div>
          <div>
            <b>Last Updated:</b> {ticket.ai_updated_at ?? "-"}
          </div>
          <div>
            <b>Last Error:</b> {ticket.ai_last_error ?? "-"}
          </div>
          <div>
            <b>Entities:</b>
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
              {parseEntities(ticket.ai_entities)}
            </pre>
          </div>
        </div>
      </section>

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