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

type Pill = {
  label: string;
  href: string;
  isActive: (sp: ReturnType<typeof useSearchParams>) => boolean;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatSla(dueAt: string | null, status: string) {
  if (!dueAt) return { text: "No SLA", tone: "muted" as const };

  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffMs = due - now;

  // closed tickets shouldn't scream overdue
  const isClosed = status === "closed";
  if (isClosed) return { text: "Closed", tone: "muted" as const };

  const abs = Math.abs(diffMs);
  const mins = Math.floor(abs / (60 * 1000));
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  const pretty =
    days > 0
      ? `${days}d ${hrs % 24}h`
      : hrs > 0
      ? `${hrs}h ${mins % 60}m`
      : `${mins}m`;

  if (diffMs < 0) return { text: `Overdue ${pretty}`, tone: "danger" as const };
  if (diffMs <= 4 * 60 * 60 * 1000) return { text: `Due ${pretty}`, tone: "warn" as const };
  return { text: `Due ${pretty}`, tone: "ok" as const };
}

function isOverdue(t: Ticket) {
  if (!t.due_at) return false;
  if (t.status === "closed") return false;
  return new Date(t.due_at).getTime() < Date.now();
}

function badgeStyle(kind: "status" | "priority" | "category" | "sla", value: string) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    whiteSpace: "nowrap",
  };

  if (kind === "status") {
    if (value === "open") return { ...base, background: "rgba(34,197,94,0.14)", borderColor: "rgba(34,197,94,0.35)" };
    if (value === "closed") return { ...base, background: "rgba(148,163,184,0.14)", borderColor: "rgba(148,163,184,0.35)" };
  }

  if (kind === "priority") {
    if (value === "high") return { ...base, background: "rgba(239,68,68,0.16)", borderColor: "rgba(239,68,68,0.4)" };
    if (value === "medium") return { ...base, background: "rgba(245,158,11,0.14)", borderColor: "rgba(245,158,11,0.38)" };
    if (value === "low") return { ...base, background: "rgba(100,116,139,0.14)", borderColor: "rgba(100,116,139,0.35)" };
  }

  if (kind === "category") {
    if (value === "billing") return { ...base, background: "rgba(59,130,246,0.14)", borderColor: "rgba(59,130,246,0.35)" };
    if (value === "login") return { ...base, background: "rgba(168,85,247,0.14)", borderColor: "rgba(168,85,247,0.35)" };
  }

  if (kind === "sla") {
    if (value === "danger") return { ...base, background: "rgba(239,68,68,0.16)", borderColor: "rgba(239,68,68,0.42)" };
    if (value === "warn") return { ...base, background: "rgba(245,158,11,0.16)", borderColor: "rgba(245,158,11,0.42)" };
    if (value === "ok") return { ...base, background: "rgba(34,197,94,0.14)", borderColor: "rgba(34,197,94,0.35)" };
    return { ...base, background: "rgba(148,163,184,0.12)", borderColor: "rgba(148,163,184,0.25)", color: "rgba(255,255,255,0.75)" };
  }

  return base;
}

export default function InboxPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

    return qs;
  }, [sp]);

  const pills: Pill[] = useMemo(
    () => [
      {
        label: "All",
        href: "/inbox",
        isActive: (sp) =>
          !sp.get("status") && !sp.get("priority") && !sp.get("category") && !sp.get("assignee") && !sp.get("overdue"),
      },
      { label: "Open", href: "/inbox?status=open", isActive: (sp) => sp.get("status") === "open" },
      { label: "High Priority", href: "/inbox?priority=high", isActive: (sp) => sp.get("priority") === "high" },
      { label: "Billing", href: "/inbox?category=billing", isActive: (sp) => sp.get("category") === "billing" },
      { label: "Login", href: "/inbox?category=login", isActive: (sp) => sp.get("category") === "login" },
      { label: "Overdue", href: "/inbox?overdue=true", isActive: (sp) => sp.get("overdue") === "true" },
    ],
    []
  );

  // Metrics computed from currently-loaded tickets (page/view).
  const metrics = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === "open").length;
    const closed = tickets.filter((t) => t.status === "closed").length;
    const overdue = tickets.filter((t) => isOverdue(t)).length;
    const high = tickets.filter((t) => t.priority === "high").length;
    return { total, open, closed, overdue, high };
  }, [tickets]);

  // Step 1: validate session
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

      const url =
        filters.toString().length > 0
          ? `${API_BASE}/tickets?${filters.toString()}`
          : `${API_BASE}/tickets`;

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
  }

  // Step 2: load tickets once session ready + whenever filters change
  useEffect(() => {
    if (!sessionChecked) return;
    if (!accessToken) return;
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, accessToken, filters.toString()]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!sessionChecked) {
    return (
      <main style={styles.shell}>
        <div style={styles.card}>Checking session…</div>
      </main>
    );
  }

  if (!accessToken) {
    return (
      <main style={styles.shell}>
        <div style={styles.card}>Redirecting to login…</div>
      </main>
    );
  }

  return (
    <main style={styles.shell}>
      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>Inbox Pilot</div>
            <h1 style={styles.title}>Inbox</h1>
            <div style={styles.subtitle}>Support triage dashboard (current view)</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => fetchTickets()}
              style={styles.secondaryBtn}
              disabled={loading}
              title="Refresh"
            >
              Refresh
            </button>
            <button onClick={logout} style={styles.primaryBtn}>
              Logout
            </button>
          </div>
        </header>

        {/* Filter Pills */}
        <div style={styles.pillsRow}>
          {pills.map((p) => {
            const active = p.isActive(sp);
            return (
              <a
                key={p.href}
                href={p.href}
                style={{
                  ...styles.pill,
                  ...(active ? styles.pillActive : null),
                }}
              >
                {p.label}
              </a>
            );
          })}
        </div>

        {/* Metrics */}
        <section style={styles.metricsGrid}>
          <MetricCard label="Total" value={metrics.total} tone="neutral" />
          <MetricCard label="Open" value={metrics.open} tone="ok" />
          <MetricCard label="Closed" value={metrics.closed} tone="muted" />
          <MetricCard label="Overdue" value={metrics.overdue} tone="danger" />
          <MetricCard label="High Priority" value={metrics.high} tone="warn" />
        </section>

        {/* Content */}
        <section style={styles.tableCard}>
          <div style={styles.tableHeader}>
            <div style={{ fontWeight: 700 }}>Tickets</div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>
              {loading ? "Loading…" : `${tickets.length} loaded`}
            </div>
          </div>

          {err ? (
            <div style={styles.errorBox}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Failed to load tickets</div>
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, opacity: 0.9 }}>
                {err}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <button style={styles.primaryBtn} onClick={() => fetchTickets()}>
                  Retry
                </button>
                <a href="/inbox" style={styles.linkBtn}>
                  Reset filters
                </a>
              </div>
            </div>
          ) : loading ? (
            <div style={styles.loadingBox}>Loading tickets…</div>
          ) : tickets.length === 0 ? (
            <div style={styles.emptyBox}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>No tickets found</div>
              <div style={{ opacity: 0.8 }}>Try changing filters or create more sample tickets.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ticket</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Priority</th>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Assignee</th>
                    <th style={styles.th}>SLA</th>
                    <th style={styles.th}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => {
                    const sla = formatSla(t.due_at, t.status);
                    const rowOverdue = isOverdue(t);

                    return (
                      <tr
                        key={t.id}
                        style={{
                          ...styles.tr,
                          ...(rowOverdue ? styles.trOverdue : null),
                        }}
                      >
                        <td style={styles.td}>
                          <a href={`/inbox/${t.id}`} style={styles.ticketLink}>
                            <div style={{ fontWeight: 800 }}>
                              #{t.id} — {t.subject}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>
                              {t.assignee ? `Assigned to ${t.assignee}` : "Unassigned"}
                            </div>
                          </a>
                        </td>

                        <td style={styles.td}>
                          <span style={badgeStyle("status", t.status)}>{t.status}</span>
                        </td>

                        <td style={styles.td}>
                          <span style={badgeStyle("priority", t.priority)}>{t.priority}</span>
                        </td>

                        <td style={styles.td}>
                          <span style={badgeStyle("category", t.category)}>{t.category}</span>
                        </td>

                        <td style={styles.td}>
                          {t.assignee ? (
                            <span style={styles.assigneeChip}>{t.assignee}</span>
                          ) : (
                            <span style={{ opacity: 0.6 }}>—</span>
                          )}
                        </td>

                        <td style={styles.td}>
                          <span style={badgeStyle("sla", sla.tone)}>{sla.text}</span>
                        </td>

                        <td style={styles.td}>
                          <span style={{ fontSize: 12, opacity: 0.8 }}>{formatDate(t.created_at)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer style={styles.footer}>
          <span style={{ opacity: 0.7 }}>
            Tip: “Overdue” is computed from SLA due_at + status != closed (current view).
          </span>
        </footer>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "ok" | "warn" | "danger" | "muted";
}) {
  const toneStyle: Record<typeof tone, React.CSSProperties> = {
    neutral: { borderColor: "rgba(255,255,255,0.12)" },
    ok: { borderColor: "rgba(34,197,94,0.45)" },
    warn: { borderColor: "rgba(245,158,11,0.45)" },
    danger: { borderColor: "rgba(239,68,68,0.50)" },
    muted: { borderColor: "rgba(148,163,184,0.30)" },
  };

  return (
    <div style={{ ...styles.metricCard, ...toneStyle[tone] }}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 600px at 10% 0%, rgba(59,130,246,0.22), transparent 60%), radial-gradient(1000px 600px at 90% 10%, rgba(168,85,247,0.18), transparent 55%), #0b1020",
    color: "white",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "28px 18px 40px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 18,
  },
  kicker: { fontSize: 12, opacity: 0.7, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 30, margin: "6px 0 0", lineHeight: 1.1 },
  subtitle: { fontSize: 13, opacity: 0.75, marginTop: 6 },
  primaryBtn: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 700,
    cursor: "pointer",
  },
  linkBtn: {
    display: "inline-flex",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "transparent",
    color: "rgba(255,255,255,0.9)",
    fontWeight: 700,
    textDecoration: "none",
  },
  pillsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  pill: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
  },
  pillActive: {
    background: "rgba(59,130,246,0.22)",
    borderColor: "rgba(59,130,246,0.42)",
    color: "white",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
  },
  metricLabel: { fontSize: 12, opacity: 0.72, fontWeight: 700, marginBottom: 8 },
  metricValue: { fontSize: 22, fontWeight: 900, letterSpacing: 0.2 },
  tableCard: {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 900,
  },
  th: {
    textAlign: "left",
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    opacity: 0.75,
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    verticalAlign: "top",
  },
  tr: {
    transition: "background 140ms ease",
  },
  trOverdue: {
    background: "rgba(239,68,68,0.06)",
  },
  ticketLink: {
    display: "block",
    color: "white",
    textDecoration: "none",
  },
  assigneeChip: {
    display: "inline-flex",
    padding: "5px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    fontWeight: 700,
  },
  errorBox: {
    padding: 16,
    margin: 14,
    borderRadius: 14,
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.08)",
  },
  loadingBox: {
    padding: 16,
    margin: 14,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    opacity: 0.9,
  },
  emptyBox: {
    padding: 22,
    margin: 14,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
  },
  footer: {
    marginTop: 14,
    fontSize: 12,
  },
  card: {
    maxWidth: 520,
    margin: "40px auto",
    padding: 18,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
  },
};