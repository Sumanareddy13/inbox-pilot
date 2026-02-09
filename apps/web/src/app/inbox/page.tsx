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

    if (status) qs.set("status", status);
    if (priority) qs.set("priority", priority);
    if (category) qs.set("category", category);
    if (assignee) qs.set("assignee", assignee);

    return qs;
  }, [sp]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || null;

      console.log("HAS SESSION:", !!data.session);
      console.log("FULL TOKEN:", token);

      if (token) {
      const payload = JSON.parse(atob(token.split(".")[1]));
      console.log("JWT iss:", payload.iss);
      console.log("JWT aud:", payload.aud);
    }


      setAccessToken(token);
      setSessionChecked(true);

      if (!token) {
        router.push("/login");
        return;
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!sessionChecked) return;
    if (!accessToken) return;

    (async () => {
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
        setErr(e.message || "Failed to load tickets");
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
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Inbox</h1>
        <button onClick={logout} style={{ padding: "8px 12px" }}>
          Logout
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, fontSize: 14 }}>
        <a href="/inbox">All</a>
        <a href="/inbox?status=open">Open</a>
        <a href="/inbox?priority=high">High Priority</a>
        <a href="/inbox?category=billing">Billing</a>
        <a href="/inbox?category=login">Login</a>
      </div>

      {loading ? (
        <p>Loading tickets…</p>
      ) : err ? (
        <p style={{ color: "tomato" }}>Error: {err}</p>
      ) : (
        <>
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
                    status: {t.status} • priority: {t.priority} • category: {t.category}
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
        </>
      )}
    </main>
  );
}
