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
const DEFAULT_LIMIT = 20;

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

function pillStyle(kind: "open" | "closed" | "high" | "med" | "low" | "billing" | "login" | "other") {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 12,
    lineHeight: "18px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
  };

  const map: Record<string, React.CSSProperties> = {
    open: { background: "rgba(34,197,94,0.14)", borderColor: "rgba(34,197,94,0.35)" },
    closed: { background: "rgba(148,163,184,0.14)", borderColor: "rgba(148,163,184,0.35)" },

    high: { background: "rgba(239,68,68,0.14)", borderColor: "rgba(239,68,68,0.35)" },
    med: { background: "rgba(245,158,11,0.14)", borderColor: "rgba(245,158,11,0.35)" },
    low: { background: "rgba(59,130,246,0.14)", borderColor: "rgba(59,130,246,0.35)" },

    billing: { background: "rgba(168,85,247,0.14)", borderColor: "rgba(168,85,247,0.35)" },
    login: { background: "rgba(14,165,233,0.14)", borderColor: "rgba(14,165,233,0.35)" },
    other: { background: "rgba(148,163,184,0.14)", borderColor: "rgba(148,163,184,0.35)" },
  };

  return { ...base, ...(map[kind] || {}) };
}

export default function InboxPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // --- UI state from query params ---
  const status = sp.get("status") || "";
  const priority = sp.get("priority") || "";
  const category = sp.get("category") || "";
  const assignee = sp.get("assignee") || "";
  const overdue = sp.get("overdue") || "";

  const page = Math.max(1, Number(sp.get("page") || "1"));
  const limit = Math.min(100, Math.max(5, Number(sp.get("limit") || String(DEFAULT_LIMIT))));
  const sort = sp.get("sort") || "created_at"; // created_at | priority | due_at
  const dir = sp.get("dir") || "desc"; // asc | desc

  const filters = useMemo(() => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (priority) qs.set("priority", priority);
    if (category) qs.set("category", category);
    if (assignee) qs.set("assignee", assignee);
    if (overdue) qs.set("overdue", overdue);

    qs.set("page", String(page));
    qs.set("limit", String(limit));
    qs.set("sort", sort);
    qs.set("dir", dir);

    return qs;
  }, [status, priority, category, assignee, overdue, page, limit, sort, dir]);

  function gotoQuery(next: Record<string, string | null>) {
    const qs = new URLSearchParams(filters.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") qs.delete(k);
      else qs.set(k, v);
    }
    // whenever filters change, reset page unless explicitly set
    if (!("page" in next)) qs.set("page", "1");
    router.push(`/inbox?${qs.toString()}`);
  }

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

  // 2) Fetch tickets
  useEffect(() => {
    if (!sessionChecked) return;
    if (!accessToken) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const url = `${API_BASE}/tickets?${filters.toString()}`;

        const res = await fetch(url, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`${res.status} ${text}`);
        }

        const data = (await res.json()) as Ticket[];
        setTickets(data);
      } catch (e: any) {
        setErr(e?.message || "Failed to load tickets");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionChecked, accessToken, filters]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!sessionChecked) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Checking session…</main>;
  }

  if (!accessToken) {
    return <main style={{ padding: 24, fontFamily: "system-ui" }}>Redirecting to login…</main>;
  }

  return (
    <main
      style={{
        padding: 22,
        fontFamily: "system-ui",
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.28), transparent 55%), radial-gradient(900px 500px at 90% 0%, rgba(34,197,94,0.18), transparent 50%)",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 28, fontWeight: 750, letterSpacing: -0.4 }}>Inbox</div>
          <div style={{ opacity: 0.75, fontSize: 13, marginTop: 2 }}>
            Filters • sorting • pagination
          </div>
        </div>

        <button
          onClick={logout}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      {/* Control bar */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr 1fr",
          gap: 12,
          padding: 14,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(0,0,0,0.28)",
          backdropFilter: "blur(8px)",
          marginBottom: 14,
        }}
      >
        {/* Quick links */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => router.push("/inbox")} style={linkBtn()}>
            All
          </button>
          <button onClick={() => gotoQuery({ status: "open" })} style={linkBtn()}>
            Open
          </button>
          <button onClick={() => gotoQuery({ priority: "high" })} style={linkBtn()}>
            High Priority
          </button>
          <button onClick={() => gotoQuery({ category: "billing" })} style={linkBtn()}>
            Billing
          </button>
          <button onClick={() => gotoQuery({ category: "login" })} style={linkBtn()}>
            Login
          </button>
          <button onClick={() => gotoQuery({ overdue: "true" })} style={linkBtn()}>
            Overdue
          </button>
        </div>

        {/* Sorting */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
          <label style={{ opacity: 0.85, fontSize: 13 }}>Sort</label>
          <select
            value={sort}
            onChange={(e) => gotoQuery({ sort: e.target.value })}
            style={selectStyle()}
          >
            <option value="created_at">Newest</option>
            <option value="due_at">SLA due</option>
            <option value="priority">Priority</option>
          </select>
          <select value={dir} onChange={(e) => gotoQuery({ dir: e.target.value })} style={selectStyle()}>
            <option value="desc">desc</option>
            <option value="asc">asc</option>
          </select>
        </div>

        {/* Page size */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
          <label style={{ opacity: 0.85, fontSize: 13 }}>Page size</label>
          <select
            value={String(limit)}
            onChange={(e) => gotoQuery({ limit: e.target.value })}
            style={selectStyle()}
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </div>

        {/* Pagination */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end" }}>
          <button
            onClick={() => gotoQuery({ page: String(Math.max(1, page - 1)) })}
            disabled={page <= 1}
            style={navBtn(page <= 1)}
          >
            ← Prev
          </button>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            Page <b>{page}</b>
          </div>
          <button onClick={() => gotoQuery({ page: String(page + 1) })} style={navBtn(false)}>
            Next →
          </button>
        </div>
      </section>

      {/* Content */}
      <section
        style={{
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(0,0,0,0.24)",
          backdropFilter: "blur(8px)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, opacity: 0.85 }}>
              {loading ? "Loading…" : err ? "Error" : `Showing ${tickets.length} tickets`}
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              GET /tickets?{filters.toString()}
            </div>
          </div>
          {err && <div style={{ marginTop: 10, color: "tomato", fontSize: 14 }}>Error: {err}</div>}
        </div>

        {!loading && !err && tickets.length === 0 ? (
          <div style={{ padding: 16, opacity: 0.8 }}>No tickets match the current filters.</div>
        ) : (
          <div>
            {tickets.map((t) => {
              const pri =
                t.priority === "high" ? "high" : t.priority === "low" ? "low" : "med";
              const cat =
                t.category === "billing" ? "billing" : t.category === "login" ? "login" : "other";
              const st = t.status === "closed" ? "closed" : "open";

              return (
                <div
                  key={t.id}
                  style={{
                    padding: 14,
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    display: "grid",
                    gridTemplateColumns: "1.6fr 1fr 1fr 1.2fr",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <a
                      href={`/inbox/${t.id}`}
                      style={{
                        color: "white",
                        textDecoration: "none",
                        display: "inline-block",
                        maxWidth: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        #{t.id} — {t.subject}
                      </div>
                    </a>
                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={pillStyle(st)}>{t.status}</span>
                      <span style={pillStyle(pri)}>{t.priority}</span>
                      <span style={pillStyle(cat)}>{t.category}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Assignee</div>
                    <div>{t.assignee ?? "-"}</div>
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>SLA</div>
                    <div>{formatSla(t.due_at)}</div>
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.85, textAlign: "right" }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Created</div>
                    <div>{t.created_at}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function linkBtn(): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.05)",
    cursor: "pointer",
    fontSize: 13,
    color: "white",
  };
}

function selectStyle(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(0,0,0,0.35)",
    color: "white",
    outline: "none",
  };
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
    color: disabled ? "rgba(255,255,255,0.45)" : "white",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}