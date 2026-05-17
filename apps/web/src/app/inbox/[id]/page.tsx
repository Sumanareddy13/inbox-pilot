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
  draft_reply: string | null;
  draft_status: string;
  draft_kb_refs: string | null;
  draft_last_error: string | null;
  draft_updated_at: string | null;
};

type Message = {
  id: number;
  ticket_id: number;
  sender_type: string;
  body: string;
  created_at: string;
};

type ParsedEntities = {
  customer_email: string | null;
  order_id: string | null;
  keywords: string[];
  needs_human_review: boolean;
};

type KbRef = {
  id: number;
  title: string;
  category: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
const USER_ROLE = process.env.NEXT_PUBLIC_USER_ROLE || "agent";

function canManageTicket() {
  return ["admin", "supervisor", "team_lead"].includes(USER_ROLE.toLowerCase());
}

function getAssignees(): string[] {
  const raw = process.env.NEXT_PUBLIC_ASSIGNEES || "Sumana";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function formatSla(dueAt: string | null) {
  if (!dueAt) return "No SLA";
  const diffMs = new Date(dueAt).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const mins = Math.floor(abs / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const pretty = days > 0 ? `${days}d ${hrs % 24}h` : hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
  return diffMs < 0 ? `Overdue by ${pretty}` : `Due in ${pretty}`;
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

function hasVisibleEntities(entities: ParsedEntities | null) {
  if (!entities) return false;
  return Boolean(entities.customer_email || entities.order_id || entities.keywords.length > 0);
}

function parseKbRefs(raw: string | null): KbRef[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: Number(item.id),
      title: String(item.title || ""),
      category: String(item.category || "other"),
    }));
  } catch {
    return [];
  }
}

function pillStyle(color: "green" | "amber" | "red" | "blue" | "neutral"): React.CSSProperties {
  const colors = {
    green: ["rgba(34,197,94,0.42)", "rgba(34,197,94,0.12)"],
    amber: ["rgba(245,158,11,0.45)", "rgba(245,158,11,0.14)"],
    red: ["rgba(239,68,68,0.45)", "rgba(239,68,68,0.14)"],
    blue: ["rgba(59,130,246,0.45)", "rgba(59,130,246,0.14)"],
    neutral: ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.06)"],
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 9px",
    borderRadius: 999,
    border: `1px solid ${colors[color][0]}`,
    background: colors[color][1],
    fontSize: 11,
    fontWeight: 800,
    color: "white",
  };
}

function statusPill(status: string) {
  if (status === "complete" || status === "approved") return pillStyle("green");
  if (status === "running" || status === "edited" || status === "generated") return pillStyle("amber");
  if (status === "failed" || status === "rejected") return pillStyle("red");
  return pillStyle("neutral");
}

function confidenceStyle(value: number | null): React.CSSProperties {
  if (value === null || value === undefined) return pillStyle("neutral");
  if (value >= 0.8) return pillStyle("green");
  if (value >= 0.5) return pillStyle("amber");
  return pillStyle("red");
}

function cardStyle(): React.CSSProperties {
  return {
    marginTop: 14,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    background: "rgba(255,255,255,0.035)",
  };
}

function buttonStyle(primary = false, danger = false): React.CSSProperties {
  return {
    padding: "7px 11px",
    borderRadius: 9,
    border: danger ? "1px solid rgba(239,68,68,0.35)" : "1px solid rgba(255,255,255,0.16)",
    background: danger ? "rgba(239,68,68,0.12)" : primary ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftText, setDraftText] = useState("");

  const assignees = useMemo(() => getAssignees(), []);
  const entities = useMemo(() => parseEntities(ticket?.ai_entities ?? null), [ticket?.ai_entities]);
  const kbRefs = useMemo(() => parseKbRefs(ticket?.draft_kb_refs ?? null), [ticket?.draft_kb_refs]);
  const showEntities = useMemo(() => hasVisibleEntities(entities), [entities]);
  const showManagerControls = canManageTicket();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || null;
      setAccessToken(token);
      setSessionChecked(true);
      if (!token) router.push("/login");
    })();
  }, [router]);

  useEffect(() => {
    setDraftText(ticket?.draft_reply ?? "");
  }, [ticket?.draft_reply]);

  async function loadTicketData(token: string, id: string) {
    const headers = { Authorization: `Bearer ${token}` };
    const [tRes, mRes] = await Promise.all([
      fetch(`${API_BASE}/tickets/${id}`, { cache: "no-store", headers }),
      fetch(`${API_BASE}/tickets/${id}/messages`, { cache: "no-store", headers }),
    ]);

    if (!tRes.ok) throw new Error(`Ticket fetch failed: ${tRes.status} ${await tRes.text()}`);
    if (!mRes.ok) throw new Error(`Messages fetch failed: ${mRes.status} ${await mRes.text()}`);

    setTicket((await tRes.json()) as Ticket);
    setMessages((await mRes.json()) as Message[]);
  }

  useEffect(() => {
    if (!sessionChecked || !accessToken || !ticketId) return;
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
    if (!accessToken || !ticketId || !ticket || ticket.ai_status !== "running") return;
    const interval = window.setInterval(() => void loadTicketData(accessToken, ticketId), 1500);
    return () => window.clearInterval(interval);
  }, [accessToken, ticketId, ticket]);

  useEffect(() => {
    setRunningAnalysis(ticket?.ai_status === "running");
  }, [ticket?.ai_status]);

  async function apiPatch(body: any) {
    if (!accessToken || !ticketId) return;

    const res = await fetch(`${API_BASE}/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    await loadTicketData(accessToken, ticketId);
  }

  async function runAnalysis() {
    if (!accessToken || !ticketId) return;
    try {
      setRunningAnalysis(true);
      const res = await fetch(`${API_BASE}/tickets/${ticketId}/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      await loadTicketData(accessToken, ticketId);
    } catch (e: any) {
      setRunningAnalysis(false);
      alert(e.message || "Analysis failed");
    }
  }

  async function generateDraft() {
    if (!accessToken || !ticketId) return;
    try {
      setGeneratingDraft(true);
      const res = await fetch(`${API_BASE}/tickets/${ticketId}/draft`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      await loadTicketData(accessToken, ticketId);
    } catch (e: any) {
      alert(e.message || "Draft generation failed");
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function updateDraft(status: "edited" | "approved" | "rejected") {
    if (!accessToken || !ticketId) return;

    if (status !== "rejected" && !draftText.trim()) {
      alert("Draft cannot be empty.");
      return;
    }

    const body = status === "rejected" ? { draft_status: "rejected" } : { draft_status: status, draft_reply: draftText.trim() };

    try {
      setSavingDraft(true);
      const res = await fetch(`${API_BASE}/tickets/${ticketId}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      await loadTicketData(accessToken, ticketId);
    } catch (e: any) {
      alert(e.message || "Draft update failed");
    } finally {
      setSavingDraft(false);
    }
  }

  if (!sessionChecked) return <main style={{ padding: 24, fontFamily: "system-ui" }}>Checking session…</main>;
  if (!accessToken) return <main style={{ padding: 24, fontFamily: "system-ui" }}>Redirecting to login…</main>;
  if (loading) return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading ticket…</main>;

  if (err || !ticket) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <a href="/inbox">← Back to Inbox</a>
        <p style={{ color: "tomato", marginTop: 16 }}>{err || "Ticket not found."}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "28px 24px", fontFamily: "system-ui" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <a href="/inbox">← Back to Inbox</a>
          <a href="/knowledge">Knowledge Base</a>
          <a href="/metrics">Metrics</a>
        </div>

        <h1 style={{ fontSize: 24, margin: "8px 0" }}>🎫 {ticket.subject}</h1>

        <div style={{ marginTop: 6, opacity: 0.86, lineHeight: 1.55 }}>
          <div><b>Ticket:</b> #{ticket.id}</div>
          <div><b>Status:</b> {ticket.status} • <b>Priority:</b> {ticket.priority} • <b>Category:</b> {ticket.category}</div>
          <div><b>Owner:</b> {ticket.assignee ?? "Unassigned"}</div>
          <div><b>SLA:</b> {formatSla(ticket.due_at)}</div>
        </div>

        {showManagerControls && (
          <section style={cardStyle()}>
            <h2 style={{ fontSize: 15, marginBottom: 10 }}>🛠 Manager Controls</h2>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label htmlFor="assignee"><b>Assign:</b></label>
              <select
                id="assignee"
                value={ticket.assignee ?? ""}
                style={{ padding: 8 }}
                onChange={async (e) => {
                  try {
                    await apiPatch({ assignee: e.target.value });
                  } catch (e: any) {
                    alert(e.message || "Assign failed");
                  }
                }}
              >
                <option value="">Unassigned</option>
                {assignees.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>

              <button onClick={() => apiPatch({ status: "closed" })} disabled={ticket.status === "closed"} style={buttonStyle()}>
                {ticket.status === "closed" ? "Already Closed" : "Close Ticket"}
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <b>Set SLA:</b>{" "}
              <button style={buttonStyle()} onClick={() => apiPatch({ due_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() })}>+4h</button>{" "}
              <button style={buttonStyle()} onClick={() => apiPatch({ due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })}>+24h</button>{" "}
              <button style={buttonStyle()} onClick={() => apiPatch({ due_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() })}>+72h</button>{" "}
              <button style={buttonStyle()} onClick={() => apiPatch({ due_at: "" })}>Clear</button>
            </div>
          </section>
        )}

        <section style={cardStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: 17, margin: 0 }}>🤖 AI Analysis</h2>
              <div style={{ fontSize: 12, opacity: 0.72, marginTop: 3 }}>
                Classifies urgency, extracts useful context, and flags tickets needing review.
              </div>
            </div>

            <button onClick={runAnalysis} disabled={runningAnalysis} style={buttonStyle(true)}>
              {runningAnalysis ? "Analysis Running..." : "Run AI Analysis"}
            </button>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <b>Status:</b>
              <span style={statusPill(ticket.ai_status || "pending")}>{ticket.ai_status || "pending"}</span>
              {entities?.needs_human_review && <span style={pillStyle("amber")}>Needs Human Review</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
              <div><div style={{ fontSize: 12, opacity: 0.72 }}>Category</div><b>{ticket.ai_category ?? "-"}</b></div>
              <div><div style={{ fontSize: 12, opacity: 0.72 }}>Priority</div><b>{ticket.ai_priority ?? "-"}</b></div>
              <div><div style={{ fontSize: 12, opacity: 0.72 }}>Confidence</div><span style={confidenceStyle(ticket.ai_confidence)}>{prettyConfidence(ticket.ai_confidence)}</span></div>
              <div><div style={{ fontSize: 12, opacity: 0.72 }}>Last Updated</div><b>{ticket.ai_updated_at ?? "-"}</b></div>
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>Summary</div>
              <div style={{ marginTop: 5, padding: 11, borderRadius: 10, background: "rgba(255,255,255,0.045)" }}>
                {ticket.ai_summary ?? "-"}
              </div>
            </div>

            {showEntities && entities && (
              <div>
                <div style={{ fontSize: 12, opacity: 0.72 }}>Extracted Entities</div>
                <div style={{ marginTop: 7, display: "grid", gap: 8, padding: 11, borderRadius: 10, background: "rgba(255,255,255,0.045)" }}>
                  {entities.customer_email && <div><b>Email:</b> {entities.customer_email}</div>}
                  {entities.order_id && <div><b>Order ID:</b> {entities.order_id}</div>}
                  {entities.keywords.length > 0 && (
                    <div>
                      <b>Keywords:</b>{" "}
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", marginLeft: 6 }}>
                        {entities.keywords.map((keyword) => <span key={keyword} style={pillStyle("neutral")}>{keyword}</span>)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {ticket.ai_last_error && (
              <div style={{ padding: 10, borderRadius: 10, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.28)", fontSize: 13 }}>
                <b>AI Error:</b> {ticket.ai_last_error}
              </div>
            )}
          </div>
        </section>

        <section style={cardStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: 17, margin: 0 }}>🧠 Grounded Draft</h2>
              <div style={{ fontSize: 12, opacity: 0.72, marginTop: 3 }}>
                Uses approved knowledge articles. Agents review before sending.
              </div>
            </div>

            <button onClick={generateDraft} disabled={generatingDraft} style={buttonStyle(true)}>
              {generatingDraft ? "Generating..." : "Generate Draft"}
            </button>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 11 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b>Status:</b>
              <span style={statusPill(ticket.draft_status || "not_generated")}>{ticket.draft_status || "not_generated"}</span>
              {ticket.draft_updated_at && <span style={{ fontSize: 12, opacity: 0.75 }}>Updated: {ticket.draft_updated_at}</span>}
            </div>

            {kbRefs.length > 0 && (
              <div>
                <div style={{ fontSize: 12, opacity: 0.72 }}>Grounded by KB Articles</div>
                <div style={{ marginTop: 7, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {kbRefs.map((ref) => <span key={`${ref.id}-${ref.title}`} style={pillStyle("neutral")}>KB #{ref.id}: {ref.title}</span>)}
                </div>
              </div>
            )}
            

            {ticket.draft_last_error && (
              <div style={{ padding: 10, borderRadius: 10, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.28)", fontSize: 13 }}>
                <b>Draft Error:</b> {ticket.draft_last_error}
              </div>
            )}

            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Generate a grounded draft, then edit before approval..."
              rows={7}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.045)",
                color: "white",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                lineHeight: 1.45,
              }}
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => updateDraft("edited")} disabled={savingDraft || !draftText.trim()} style={buttonStyle()}>Save Edits</button>
              <button onClick={() => updateDraft("approved")} disabled={savingDraft || !draftText.trim()} style={buttonStyle(true)}>Approve Draft</button>
              <button onClick={() => updateDraft("rejected")} disabled={savingDraft || ticket.draft_status === "not_generated"} style={buttonStyle(false, true)}>Reject Draft</button>
            </div>
          </div>
        </section>

        <h2 style={{ fontSize: 17, marginTop: 18 }}>💬 Messages</h2>

        <MessageComposer
          onSend={async (body) => {
            try {
              if (!accessToken || !ticketId) return;
              const res = await fetch(`${API_BASE}/tickets/${ticketId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ sender_type: "customer", body }),
                cache: "no-store",
              });
              if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
              await loadTicketData(accessToken, ticketId);
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
              <li key={m.id} style={{ marginBottom: 8 }}>
                <div><b>{m.sender_type}</b>: {m.body}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{m.created_at}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function MessageComposer({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [text, setText] = useState("");

  return (
    <div style={{ marginTop: 8, marginBottom: 10, display: "flex", gap: 10 }}>
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
        style={{ padding: "9px 12px" }}
      >
        Send
      </button>
    </div>
  );
}