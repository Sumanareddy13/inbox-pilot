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

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || null;

      setAccessToken(token);
      setSessionChecked(true);

      if (!token) router.push("/login");
    })();
  }, [router]);

  async function load() {
    if (!ticketId) return;
    if (!accessToken) return;

    try {
      setLoading(true);
      setErr(null);

      const [tRes, mRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/tickets/${ticketId}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${API_BASE}/tickets/${ticketId}/messages`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${API_BASE}/tickets/${ticketId}/audit`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (!tRes.ok) throw new Error(`Ticket fetch failed: ${tRes.status} ${await tRes.text()}`);
      if (!mRes.ok) throw new Error(`Messages fetch failed: ${mRes.status} ${await mRes.text()}`);
      if (!aRes.ok) throw new Error(`Audit fetch failed: ${aRes.status} ${await aRes.text()}`);

      setTicket(await tRes.json());
      setMessages(await mRes.json());
      setAudit(await aRes.json());
    } catch (e: any) {
      setErr(e.message || "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!sessionChecked) return;
    if (!accessToken) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, accessToken, ticketId]);

  async function updateTicket(patch: any) {
    if (!accessToken) return;
    const res = await fetch(`${API_BASE}/tickets/${ticketId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      throw new Error(`Update failed: ${res.status} ${await res.text()}`);
    }
  }

  async function assign(assignee: string) {
    await updateTicket({ assignee });
    await load();
  }

  async function close() {
    await updateTicket({ status: "closed" });
    await load();
  }

  if (!sessionChecked) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Checking session…</main>;
  }

  if (!accessToken) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Redirecting to login…</main>;
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading…</main>;
  }

  if (err || !ticket) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <a href="/inbox">← Back to Inbox</a>
        <p style={{ color: "tomato", marginTop: 10 }}>Error: {err || "Ticket not found"}</p>
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

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label htmlFor="assignee">
            <b>Assign:</b>
          </label>

          <select
            id="assignee"
            defaultValue={ticket.assignee ?? assignees[0] ?? ""}
            onChange={(e) => assign(e.target.value)}
            style={{ padding: 8 }}
          >
            {assignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <button
            onClick={() => close()}
            disabled={ticket.status === "closed"}
            style={{ padding: "8px 12px" }}
          >
            {ticket.status === "closed" ? "Already Closed" : "Close Ticket"}
          </button>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 22 }}>
        {/* Messages */}
        <section style={{ padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10 }}>
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Messages</h2>
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
        </section>

        {/* Activity */}
        <section style={{ padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10 }}>
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Activity</h2>
          {audit.length === 0 ? (
            <p>No activity yet.</p>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              {audit.map((a) => (
                <li key={a.id} style={{ marginBottom: 10 }}>
                  <div>
                    <b>{a.action}</b> — <span style={{ opacity: 0.9 }}>{a.actor}</span>
                  </div>
                  {a.meta_json && (
                    <pre
                      style={{
                        marginTop: 6,
                        padding: 8,
                        borderRadius: 8,
                        overflowX: "auto",
                        fontSize: 12,
                        background: "rgba(255,255,255,0.06)",
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
        </section>
      </div>
    </main>
  );
}
