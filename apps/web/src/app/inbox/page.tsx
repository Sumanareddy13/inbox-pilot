"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

function getAssignees(): string[] {
  const raw = process.env.NEXT_PUBLIC_ASSIGNEES || "Sumana";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSla(dueAt: string | null) {
  if (!dueAt) return "No SLA";

  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffMs = due - now;

  const abs = Math.abs(diffMs);
  const mins = Math.floor(abs / (60 * 1000));
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  const pretty =
    days > 0 ? `${days}d ${hrs % 24}h` : hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;

  if (diffMs < 0) return `Overdue ${pretty}`;
  return `Due ${pretty}`;
}

function pillStyle(kind: "status" | "priority" | "category" | "sla", value: string) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    fontWeight: 600 as const,
    letterSpacing: 0.2,
    whiteSpace: "nowrap" as const,
  };

  if (kind === "status") {
    if (value === "open") {
      return {
        ...base,
        borderColor: "rgba(34,197,94,0.35)",
        background: "rgba(34,197,94,0.10)",
      };
    }
    if (value === "closed") {
      return {
        ...base,
        borderColor: "rgba(148,163,184,0.28)",
        background: "rgba(148,163,184,0.10)",
      };
    }
  }

  if (kind === "priority") {
    if (value === "high") {
      return {
        ...base,
        borderColor: "rgba(239,68,68,0.35)",
        background: "rgba(239,68,68,0.10)",
      };
    }
    if (value === "medium") {
      return {
        ...base,
        borderColor: "rgba(245,158,11,0.35)",
        background: "rgba(245,158,11,0.10)",
      };
    }
    if (value === "low") {
      return {
        ...base,
        borderColor: "rgba(59,130,246,0.35)",
        background: "rgba(59,130,246,0.10)",
      };
    }
  }

  if (kind === "sla") {
    if (value.toLowerCase().startsWith("overdue")) {
      return {
        ...base,
        borderColor: "rgba(239,68,68,0.35)",
        background: "rgba(239,68,68,0.10)",
      };
    }
    if (value.toLowerCase().startsWith("due")) {
      return {
        ...base,
        borderColor: "rgba(245,158,11,0.35)",
        background: "rgba(245,158,11,0.10)",
      };
    }
    return {
      ...base,
      borderColor: "rgba(148,163,184,0.28)",
      background: "rgba(148,163,184,0.10)",
    };
  }

  return base;
}

function statCard(title: string, value: number, accent: "neutral" | "green" | "red" | "amber") {
  const accentBorder =
    accent === "green"
      ? "rgba(34,197,94,0.32)"
      : accent === "red"
      ? "rgba(239,68,68,0.32)"
      : accent === "amber"
      ? "rgba(245,158,11,0.32)"
      : "rgba(255,255,255,0.12)";

  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${accentBorder}`,
        background: "rgba(255,255,255,0.04)",
        padding: 14,
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.8 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);

  const [searchInput, setSearchInput] = useState(sp.get("q") || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newSubject, setNewSubject] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newCategory, setNewCategory] = useState("other");

  const [updatingRowId, setUpdatingRowId] = useState<number | null>(null);
  const [rowActionMessage, setRowActionMessage] = useState<Record<number, string>>({});

  const assignees = useMemo(() => getAssignees(), []);
  const searchInitRef = useRef(false);

  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "20", 10), 1), 200);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10), 0);
  const sortBy = sp.get("sort_by") || "created_at";
  const order = sp.get("order") || "desc";
  const q = sp.get("q") || "";

  const activeStatus = sp.get("status");
  const activePriority = sp.get("priority");
  const activeCategory = sp.get("category");
  const activeOverdue = sp.get("overdue");

  const filters = useMemo(() => {
    const qs = new URLSearchParams();

    const status = sp.get("status");
    const priority = sp.get("priority");
    const category = sp.get("category");
    const assignee = sp.get("assignee");
    const overdue = sp.get("overdue");

    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    if (priority) qs.set("priority", priority);
    if (category) qs.set("category", category);
    if (assignee) qs.set("assignee", assignee);
    if (overdue) qs.set("overdue", overdue);

    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    qs.set("sort_by", sortBy);
    qs.set("order", order);

    return qs;
  }, [sp, limit, offset, sortBy, order, q]);

  function setQS(patch: Record<string, string | null>) {
    const qs = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null || v === "") qs.delete(k);
      else qs.set(k, v);
    });
    router.push(`/inbox?${qs.toString()}`);
  }

  useEffect(() => {
    setSearchInput(sp.get("q") || "");
  }, [sp]);

  useEffect(() => {
    if (!searchInitRef.current) {
      searchInitRef.current = true;
      return;
    }

    const trimmed = searchInput.trim();
    if (trimmed === q) return;

    const timeout = window.setTimeout(() => {
      setQS({
        q: trimmed || null,
        offset: "0",
      });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [searchInput, q]);

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

  async function fetchTickets() {
    if (!accessToken) return;

    try {
      setLoading(true);
      setErr(null);

      const url = `${API_BASE}/tickets?${filters.toString()}`;
      const res = await fetch(url, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text}`);
      }

      const t = (await res.json()) as Ticket[];
      setTickets(t);

      const totalHeader = res.headers.get("X-Total-Count");
      setTotal(totalHeader ? parseInt(totalHeader, 10) : t.length);
    } catch (e: any) {
      setErr(e?.message || "Failed to load tickets");
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  async function updateTicket(ticketId: number, body: Record<string, unknown>) {
    if (!accessToken) return;

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
  }

  async function runRowAction(ticketId: number, message: string, action: () => Promise<void>) {
    try {
      setUpdatingRowId(ticketId);
      setRowActionMessage((prev) => ({ ...prev, [ticketId]: message }));

      await action();
      await fetchTickets();
    } catch (e: any) {
      alert(e?.message || "Ticket update failed");
    } finally {
      setUpdatingRowId(null);
      setRowActionMessage((prev) => {
        const next = { ...prev };
        delete next[ticketId];
        return next;
      });
    }
  }

  async function assignTicket(ticketId: number, assignee: string) {
    await runRowAction(ticketId, "Updating assignee...", async () => {
      await updateTicket(ticketId, { assignee });
    });
  }

  async function toggleTicketStatus(ticket: Ticket) {
    const nextStatus = ticket.status === "closed" ? "open" : "closed";
    const actionText = nextStatus === "closed" ? "Closing ticket..." : "Reopening ticket...";

    await runRowAction(ticket.id, actionText, async () => {
      await updateTicket(ticket.id, { status: nextStatus });
    });
  }

  useEffect(() => {
    if (!sessionChecked) return;
    if (!accessToken) return;
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, accessToken, filters]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function createTicket() {
    if (!accessToken) return;

    const subject = newSubject.trim();
    if (subject.length < 3) {
      alert("Subject must be at least 3 characters.");
      return;
    }

    try {
      setCreating(true);

      const res = await fetch(`${API_BASE}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          subject,
          priority: newPriority,
          category: newCategory,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text}`);
      }

      const created = (await res.json()) as Ticket;

      setCreateOpen(false);
      setNewSubject("");
      setNewPriority("medium");
      setNewCategory("other");

      await fetchTickets();
      router.push(`/inbox/${created.id}`);
    } catch (e: any) {
      alert(e?.message || "Failed to create ticket");
    } finally {
      setCreating(false);
    }
  }

  const stats = useMemo(() => {
    const totalCount = tickets.length;
    const open = tickets.filter((t) => t.status === "open").length;
    const closed = tickets.filter((t) => t.status === "closed").length;
    const high = tickets.filter((t) => t.priority === "high").length;
    const overdue = tickets.filter((t) => {
      if (!t.due_at) return false;
      if (t.status === "closed") return false;
      return new Date(t.due_at).getTime() < Date.now();
    }).length;

    return { totalCount, open, closed, overdue, high };
  }, [tickets]);

  const from = total === 0 ? 0 : Math.min(offset + 1, total);
  const to = total === 0 ? 0 : Math.min(offset + tickets.length, total);
  const canPrev = offset > 0;
  const canNext = offset + tickets.length < total;

  const filterButtons = [
    {
      label: "All",
      isActive: !activeStatus && !activePriority && !activeCategory && !activeOverdue,
      qs: { status: null, priority: null, category: null, overdue: null, offset: "0" },
    },
    {
      label: "Open",
      isActive: activeStatus === "open" && !activePriority && !activeCategory && !activeOverdue,
      qs: { status: "open", priority: null, category: null, overdue: null, offset: "0" },
    },
    {
      label: "High Priority",
      isActive: activePriority === "high" && !activeStatus && !activeCategory && !activeOverdue,
      qs: { priority: "high", status: null, category: null, overdue: null, offset: "0" },
    },
    {
      label: "Billing",
      isActive: activeCategory === "billing" && !activeStatus && !activePriority && !activeOverdue,
      qs: { category: "billing", status: null, priority: null, overdue: null, offset: "0" },
    },
    {
      label: "Login",
      isActive: activeCategory === "login" && !activeStatus && !activePriority && !activeOverdue,
      qs: { category: "login", status: null, priority: null, overdue: null, offset: "0" },
    },
    {
      label: "Overdue",
      isActive: activeOverdue === "true" && !activeStatus && !activePriority && !activeCategory,
      qs: { overdue: "true", status: null, priority: null, category: null, offset: "0" },
    },
  ];

  if (!sessionChecked) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Checking session…</main>;
  }

  if (!accessToken) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Redirecting to login…</main>;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "34px 24px 60px",
        fontFamily: "system-ui",
        color: "white",
        background:
          "radial-gradient(1200px 700px at 20% 10%, rgba(59,130,246,0.18), transparent 55%)," +
          "radial-gradient(1000px 700px at 85% 15%, rgba(168,85,247,0.18), transparent 55%)," +
          "linear-gradient(180deg, #0b1220, #070b14)",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.85 }}>INBOX PILOT</div>
            <h1 style={{ fontSize: 36, margin: "6px 0 6px", fontWeight: 900 }}>Inbox</h1>
            <div style={{ opacity: 0.8, fontSize: 13 }}>Support triage dashboard (current view)</div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setCreateOpen(true)} style={topBtn(true)}>
              New Ticket
            </button>
            <button onClick={() => fetchTickets()} style={topBtn(false)}>
              Refresh
            </button>
            <button onClick={logout} style={topBtn(false)}>
              Logout
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search tickets by subject..."
            style={{
              flex: "1 1 320px",
              minWidth: 280,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              outline: "none",
            }}
          />
          <div style={{ fontSize: 12, opacity: 0.72 }}>
            {searchInput.trim() !== q ? "Typing..." : q ? `Searching: "${q}"` : "Search is live"}
          </div>
          <button
            onClick={() => {
              setSearchInput("");
              setQS({ q: null, offset: "0" });
            }}
            style={actionBtn()}
          >
            Reset
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          {filterButtons.map((b) => (
            <button
              key={b.label}
              onClick={() => setQS(b.qs)}
              style={filterBtn(b.isActive)}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          {statCard("Total (page)", stats.totalCount, "neutral")}
          {statCard("Open (page)", stats.open, "green")}
          {statCard("Closed (page)", stats.closed, "neutral")}
          {statCard("Overdue (page)", stats.overdue, "red")}
          {statCard("High Priority (page)", stats.high, "amber")}
        </div>

        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ opacity: 0.85, fontSize: 13 }}>
            {total > 0 ? (
              <>
                Showing <b>{from}</b>–<b>{to}</b> of <b>{total}</b>
              </>
            ) : (
              <>No results</>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>Page size</span>
              <select
                value={String(limit)}
                onChange={(e) => setQS({ limit: e.target.value, offset: "0" })}
                style={selectStyle()}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setQS({ sort_by: e.target.value, offset: "0" })}
                style={selectStyle()}
              >
                <option value="created_at">Created</option>
                <option value="priority">Priority</option>
                <option value="due_at">SLA (due_at)</option>
                <option value="status">Status</option>
              </select>

              <button
                onClick={() => setQS({ order: order === "asc" ? "desc" : "asc", offset: "0" })}
                style={actionBtn()}
              >
                {order === "asc" ? "↑ ASC" : "↓ DESC"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={!canPrev || loading}
                onClick={() => setQS({ offset: String(Math.max(offset - limit, 0)) })}
                style={pageBtn(!canPrev || loading)}
              >
                Prev
              </button>
              <button
                disabled={!canNext || loading}
                onClick={() => setQS({ offset: String(offset + limit) })}
                style={pageBtn(!canNext || loading)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <section
          style={{
            marginTop: 14,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.03)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontWeight: 900 }}>Tickets</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              Tip: search works on subject text. Overdue is based on due_at + status != closed.
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 16, opacity: 0.85 }}>Loading…</div>
          ) : err ? (
            <div style={{ padding: 16, color: "tomato" }}>
              {err}
              <div style={{ marginTop: 10 }}>
                <button onClick={() => fetchTickets()} style={actionBtn()}>
                  Retry
                </button>
              </div>
            </div>
          ) : tickets.length === 0 ? (
            <div style={{ padding: 16, opacity: 0.85 }}>
              {q ? `No tickets matched "${q}".` : "No tickets match these filters."}
            </div>
          ) : (
            <div style={{ width: "100%", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.8 }}>
                    <th style={{ padding: "10px 14px" }}>Ticket</th>
                    <th style={{ padding: "10px 14px" }}>Status</th>
                    <th style={{ padding: "10px 14px" }}>Priority</th>
                    <th style={{ padding: "10px 14px" }}>Category</th>
                    <th style={{ padding: "10px 14px" }}>Assignee</th>
                    <th style={{ padding: "10px 14px" }}>SLA</th>
                    <th style={{ padding: "10px 14px" }}>Created</th>
                  </tr>
                </thead>

                <tbody>
                  {tickets.map((t) => {
                    const slaText = formatSla(t.due_at);
                    const isRowUpdating = updatingRowId === t.id;
                    const rowMessage = rowActionMessage[t.id];

                    return (
                      <tr
                        key={t.id}
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.08)",
                          opacity: isRowUpdating ? 0.82 : 1,
                        }}
                      >
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ fontWeight: 900, fontSize: 14 }}>
                            <a href={`/inbox/${t.id}`} style={{ color: "white", textDecoration: "none" }}>
                              #{t.id} — {t.subject}
                            </a>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 3 }}>
                            {t.assignee ? `Assigned to ${t.assignee}` : "Unassigned"}
                          </div>
                          {isRowUpdating && rowMessage && (
                            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
                              {rowMessage}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                            <span style={pillStyle("status", t.status)}>{t.status}</span>
                            <button
                              disabled={isRowUpdating}
                              onClick={() => {
                                void toggleTicketStatus(t);
                              }}
                              style={{
                                ...miniActionBtn(),
                                opacity: isRowUpdating ? 0.65 : 1,
                                cursor: isRowUpdating ? "wait" : "pointer",
                              }}
                            >
                              {isRowUpdating
                                ? "Updating..."
                                : t.status === "closed"
                                ? "Reopen"
                                : "Close"}
                            </button>
                          </div>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <span style={pillStyle("priority", t.priority)}>{t.priority}</span>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <span style={pillStyle("category", t.category)}>{t.category}</span>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <select
                            value={t.assignee ?? ""}
                            disabled={isRowUpdating}
                            onChange={(e) => {
                              void assignTicket(t.id, e.target.value);
                            }}
                            style={{
                              ...rowSelectStyle(),
                              opacity: isRowUpdating ? 0.65 : 1,
                              cursor: isRowUpdating ? "wait" : "pointer",
                            }}
                          >
                            <option value="">Unassigned</option>
                            {assignees.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <span style={pillStyle("sla", slaText)}>{slaText}</span>
                        </td>

                        <td style={{ padding: "12px 14px", opacity: 0.85 }}>
                          {formatDateShort(t.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {createOpen && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>Create Ticket</div>
                <div style={{ fontSize: 13, opacity: 0.76, marginTop: 4 }}>
                  Add a new support ticket to the inbox
                </div>
              </div>
              <button onClick={() => setCreateOpen(false)} style={closeBtnStyle}>
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              <div>
                <div style={labelStyle}>Subject</div>
                <input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Example: Payment failed for customer order"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={labelStyle}>Priority</div>
                  <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} style={selectStyle()}>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </div>

                <div>
                  <div style={labelStyle}>Category</div>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={selectStyle()}>
                    <option value="billing">billing</option>
                    <option value="login">login</option>
                    <option value="refund">refund</option>
                    <option value="other">other</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button onClick={() => setCreateOpen(false)} style={actionBtn()}>
                Cancel
              </button>
              <button onClick={createTicket} disabled={creating} style={topBtn(true)}>
                {creating ? "Creating..." : "Create Ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function topBtn(primary: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: primary ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  };
}

function actionBtn(): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  };
}

function miniActionBtn(): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontSize: 12,
    fontWeight: 700,
  };
}

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
    color: "white",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    fontWeight: 800,
  };
}

function selectStyle(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    width: "100%",
  };
}

function rowSelectStyle(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    minWidth: 140,
  };
}

function filterBtn(active: boolean): React.CSSProperties {
  return {
    padding: "7px 12px",
    borderRadius: 999,
    border: active ? "1px solid rgba(59,130,246,0.55)" : "1px solid rgba(255,255,255,0.16)",
    background: active ? "rgba(59,130,246,0.20)" : "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
    boxShadow: active ? "0 0 0 1px rgba(59,130,246,0.12) inset" : "none",
  };
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 9999,
};

const modalStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "linear-gradient(180deg, rgba(17,24,39,0.98), rgba(10,15,28,0.98))",
  color: "white",
  padding: 20,
  boxShadow: "0 20px 80px rgba(0,0,0,0.45)",
};

const closeBtnStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  cursor: "pointer",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.82,
  marginBottom: 6,
  fontWeight: 700,
};