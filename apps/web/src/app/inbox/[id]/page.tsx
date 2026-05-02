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

type ParsedEntities = {
  customer_email: string | null;
  order_id: string | null;
  keywords: string[];
  needs_human_review: boolean;
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

function parseEntities(raw: string | null): ParsedEntities | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    return {
      customer_email: parsed.customer_email ?? null,
      order_id: parsed.order_id ?? null,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      needs_human_review: Boolean(parsed.needs_human_review),
    };
  } catch {
    return null;
  }
}

function aiStatusStyle(status: string): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    fontWeight: 800,
    color: "white",
  };

  if (status === "running") {
    return {
      ...base,
      borderColor: "rgba(245,158,11,0.45)",
      background: "rgba(245,158,11,0.14)",
    };
  }

  if (status === "complete") {
    return {
      ...base,
      borderColor: "rgba(34,197,94,0.4)",
      background: "rgba(34,197,94,0.12)",
    };
  }

  if (status === "failed") {
    return {
      ...base,
      borderColor: "rgba(239,68,68,0.45)",
      background: "rgba(239,68,68,0.14)",
    };
  }

  return base;
}

function confidenceStyle(value: number | null): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    fontWeight: 800,
    color: "white",
  };

  if (value === null || value === undefined) return base;

  if (value >= 0.8) {
    return {
      ...base,
      borderColor: "rgba(34,197,94,0.42)",
      background: "rgba(34,197,94,0.12)",
    };
  }

  if (value >= 0.5) {
    return {
      ...base,
      borderColor: "rgba(245,158,11,0.45)",
      background: "rgba(245,158,11,0.14)",
    };
  }

  return {
    ...base,
    borderColor: "rgba(239,68,68,0.45)",
    background: "rgba(239,68,68,0.14)",
  };
}

function smallPillStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 9px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    fontWeight: 700,
    color: "white",
  };
}

function aiCardStyle(): React.CSSProperties {
  return {
    marginTop: 18,
    padding: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    background: "rgba(255,255,255,0.035)",
  };
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
  const entities = useMemo(() => parseEntities(ticket?.ai_entities ?? null), [ticket?.ai_entities]);

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

  useEffect(() => {
    if (!accessToken || !ticketId || !ticket) return;
    if (ticket.ai_status !== "running") return;

    const interval = window.setInterval(() => {
      void loadTicketData(accessToken, ticketId);
    }, 1500);

    return () => window.clearInterval(interval);
  }, [accessToken, ticketId, ticket]);

  useEffect(() => {
    setRunningAnalysis(ticket?.ai_status === "running");
  }, [ticket?.ai_status]);

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
      setRunningAnalysis(false);
      alert(e.message || "Analysis failed");
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
          <b>Status:</b> {ticket.status} • <b>Priority:</b> {ticket.priority} • <b>Category:</b>{" "}
          {ticket.category}
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
              try {
                await assignTicket(e.target.value);
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

      <section style={aiCardStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>AI Analysis</h2>
            <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>
              Analysis runs asynchronously with retries, validation, and audit tracking.
            </div>
          </div>

          <button
            onClick={runAnalysis}
            disabled={runningAnalysis}
            style={{
              padding: "8px 12px",
              fontWeight: 800,
              cursor: runningAnalysis ? "not-allowed" : "pointer",
              opacity: runningAnalysis ? 0.65 : 1,
            }}
          >
            {runningAnalysis ? "Analysis Running..." : "Run AI Analysis"}
          </button>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <b>Status:</b>
            <span style={aiStatusStyle(ticket.ai_status || "pending")}>{ticket.ai_status || "pending"}</span>

            {entities?.needs_human_review && (
              <span
                style={{
                  ...smallPillStyle(),
                  borderColor: "rgba(245,158,11,0.55)",
                  background: "rgba(245,158,11,0.15)",
                }}
              >
                Needs Human Review
              </span>
            )}
          </div>

          {ticket.ai_status === "running" && (
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(245,158,11,0.25)",
                background: "rgba(245,158,11,0.08)",
                fontSize: 13,
              }}
            >
              AI analysis is running. The page refreshes automatically until the result is ready.
            </div>
          )}

          {ticket.ai_status === "failed" && (
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(239,68,68,0.35)",
                background: "rgba(239,68,68,0.10)",
                fontSize: 13,
              }}
            >
              AI analysis failed. You can retry after checking the error below.
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>Suggested Category</div>
              <div style={{ marginTop: 5, fontWeight: 800 }}>{ticket.ai_category ?? "-"}</div>
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>Suggested Priority</div>
              <div style={{ marginTop: 5, fontWeight: 800 }}>{ticket.ai_priority ?? "-"}</div>
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>Confidence</div>
              <div style={{ marginTop: 5 }}>
                <span style={confidenceStyle(ticket.ai_confidence)}>{prettyConfidence(ticket.ai_confidence)}</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>Last Updated</div>
              <div style={{ marginTop: 5, fontWeight: 700 }}>{ticket.ai_updated_at ?? "-"}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Summary</div>
            <div
              style={{
                marginTop: 6,
                padding: 12,
                borderRadius: 10,
                background: "rgba(255,255,255,0.045)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {ticket.ai_summary ?? "-"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Extracted Entities</div>

            {!entities ? (
              <div style={{ marginTop: 6, opacity: 0.8 }}>No entities available.</div>
            ) : (
              <div
                style={{
                  marginTop: 8,
                  display: "grid",
                  gap: 10,
                  padding: 12,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.045)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div>
                  <b>Email:</b> {entities.customer_email ?? "-"}
                </div>
                <div>
                  <b>Order ID:</b> {entities.order_id ?? "-"}
                </div>
                <div>
                  <b>Keywords:</b>{" "}
                  {entities.keywords.length === 0 ? (
                    "-"
                  ) : (
                    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", marginLeft: 6 }}>
                      {entities.keywords.map((keyword) => (
                        <span key={keyword} style={smallPillStyle()}>
                          {keyword}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Last Error</div>
            <div
              style={{
                marginTop: 6,
                padding: 10,
                borderRadius: 10,
                background: ticket.ai_last_error ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.04)",
                border: ticket.ai_last_error
                  ? "1px solid rgba(239,68,68,0.28)"
                  : "1px solid rgba(255,255,255,0.08)",
                fontSize: 13,
                overflowX: "auto",
              }}
            >
              {ticket.ai_last_error ?? "-"}
            </div>
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