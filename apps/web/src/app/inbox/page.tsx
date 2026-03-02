"use client";

import { useEffect, useMemo, useState } from "react";
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

function formatDateShort(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
    days > 0 ? `${days}d ${hrs % 24}h` :
    hrs > 0 ? `${hrs}h ${mins % 60}m` :
    `${mins}m`;

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

  // just visual polish
  if (kind === "status") {
    if (value === "open") return { ...base, borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.10)" };
    if (value === "closed") return { ...base, borderColor: "rgba(148,163,184,0.28)", background: "rgba(148,163,184,0.10)" };
  }

  if (kind === "priority") {
    if (value === "high") return { ...base, borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" };
    if (value === "medium") return { ...base, borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.10)" };
    if (value === "low") return { ...base, borderColor: "rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.10)" };
  }

  if (kind === "sla") {
    if (value.toLowerCase().startsWith("overdue")) return { ...base, borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.10)" };
    if (value.toLowerCase().startsWith("due")) return { ...base, borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.10)" };
    return { ...base, borderColor: "rgba(148,163,184,0.28)", background: "rgba(148,163,184,0.10)" };
  }

  return base;
}

function statCard(title: string, value: number, accent: "neutral" | "green" | "red" | "amber") {
  const accentBorder =
    accent === "green" ? "rgba(34,197,94,0.32)" :
    accent === "red" ? "rgba(239,68,68,0.32)" :
    accent === "amber" ? "rgba(245,158,11,0.32)" :
    "rgba(255,255,255,0.12)";

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

  // --- query state (from URL) ---
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "20", 10), 1), 200);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10), 0);
  const sortBy = sp.get("sort_by") || "created_at";
  const order = sp.get("order") || "desc";

  const filters = useMemo(() => {
    const qs = new URLSearchParams();

    const status = sp.get("status");
    const priority = sp.get("priority");
    const category = sp.get("category");
    const assignee = sp.get("assignee");
    const overdue = sp.get("overdue");

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
  }, [sp, limit, offset, sortBy, order]);

  function setQS(patch: Record<string, string | null>) {
    const qs = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null) qs.delete(k);
      else qs.set(k, v);
    });
    router.push(`/inbox?${qs.toString()}`);
  }

  // --- auth ---
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

  // --- fetch tickets ---
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

  // --- stats computed from current page ---
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
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.85 }}>INBOX PILOT</div>
            <h1 style={{ fontSize: 36, margin: "6px 0 6px", fontWeight: 900 }}>Inbox</h1>
            <div style={{ opacity: 0.8, fontSize: 13 }}>Support triage dashboard (current view)</div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => fetchTickets()}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Refresh
            </button>
            <button
              onClick={logout}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          {[
            { label: "All", qs: { status: null, priority: null, category: null, overdue: null, offset: "0" } },
            { label: "Open", qs: { status: "open", offset: "0" } },
            { label: "High Priority", qs: { priority: "high", offset: "0" } },
            { label: "Billing", qs: { category: "billing", offset: "0" } },
            { label: "Login", qs: { category: "login", offset: "0" } },
            { label: "Overdue", qs: { overdue: "true", offset: "0" } },
          ].map((b) => (
            <button
              key={b.label}
              onClick={() => setQS(b.qs)}
              style={{
                padding: "7px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          {statCard("Total (page)", stats.totalCount, "neutral")}
          {statCard("Open (page)", stats.open, "green")}
          {statCard("Closed (page)", stats.closed, "neutral")}
          {statCard("Overdue (page)", stats.overdue, "red")}
          {statCard("High Priority (page)", stats.high, "amber")}
        </div>

        {/* Controls row */}
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
            {/* Page size */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>Page size</span>
              <select
                value={String(limit)}
                onChange={(e) => setQS({ limit: e.target.value, offset: "0" })}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                }}
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>

            {/* Sort */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setQS({ sort_by: e.target.value, offset: "0" })}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                }}
              >
                <option value="created_at">Created</option>
                <option value="priority">Priority</option>
                <option value="due_at">SLA (due_at)</option>
                <option value="status">Status</option>
              </select>

              <button
                onClick={() => setQS({ order: order === "asc" ? "desc" : "asc", offset: "0" })}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
                title="Toggle sort order"
              >
                {order === "asc" ? "↑ ASC" : "↓ DESC"}
              </button>
            </div>

            {/* Pagination */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={!canPrev || loading}
                onClick={() => setQS({ offset: String(Math.max(offset - limit, 0)) })}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: !canPrev || loading ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: !canPrev || loading ? "not-allowed" : "pointer",
                  opacity: !canPrev || loading ? 0.55 : 1,
                  fontWeight: 800,
                }}
              >
                Prev
              </button>
              <button
                disabled={!canNext || loading}
                onClick={() => setQS({ offset: String(offset + limit) })}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: !canNext || loading ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
                  color: "white",
                  cursor: !canNext || loading ? "not-allowed" : "pointer",
                  opacity: !canNext || loading ? 0.55 : 1,
                  fontWeight: 800,
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
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
              Tip: “Overdue” is computed from SLA due_at + status != closed (current view).
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 16, opacity: 0.85 }}>Loading…</div>
          ) : err ? (
            <div style={{ padding: 16, color: "tomato" }}>
              {err}
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => fetchTickets()}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          ) : tickets.length === 0 ? (
            <div style={{ padding: 16, opacity: 0.85 }}>No tickets match these filters.</div>
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
                    return (
                      <tr
                        key={t.id}
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ fontWeight: 900, fontSize: 14 }}>
                            <a
                              href={`/inbox/${t.id}`}
                              style={{ color: "white", textDecoration: "none" }}
                            >
                              #{t.id} — {t.subject}
                            </a>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 3 }}>
                            {t.assignee ? `Assigned to ${t.assignee}` : "Unassigned"}
                          </div>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <span style={pillStyle("status", t.status)}>{t.status}</span>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <span style={pillStyle("priority", t.priority)}>{t.priority}</span>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <span style={pillStyle("category", t.category)}>{t.category}</span>
                        </td>

                        <td style={{ padding: "12px 14px" }}>{t.assignee ?? "—"}</td>

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
    </main>
  );
}