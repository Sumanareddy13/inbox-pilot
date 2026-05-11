"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

type MetricsSummary = {
  total_tickets: number;
  open_tickets: number;
  closed_tickets: number;
  ai_completed: number;
  ai_failed: number;
  drafts_generated: number;
  drafts_approved: number;
  overdue_tickets: number;
};

function cardStyle(): React.CSSProperties {
  return {
    padding: 18,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
  };
}

function metricValueStyle(): React.CSSProperties {
  return {
    fontSize: 34,
    fontWeight: 900,
    marginTop: 8,
  };
}

export default function MetricsPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();

      const accessToken = data.session?.access_token || null;

      if (!accessToken) {
        router.push("/login");
        return;
      }

      setToken(accessToken);
    })();
  }, [router]);

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/metrics/summary`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(await res.text());
        }

        const data = await res.json();
        setMetrics(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const health = useMemo(() => {
    if (!metrics) return "Unknown";

    if (metrics.ai_failed > 5) return "Degraded";
    if (metrics.overdue_tickets > 5) return "Attention Needed";

    return "Healthy";
  }, [metrics]);

  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        Loading metrics...
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui",
        maxWidth: 1200,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.1,
              opacity: 0.7,
            }}
          >
            INBOX PILOT
          </div>

          <h1
            style={{
              fontSize: 42,
              margin: "8px 0",
            }}
          >
            Operations Metrics
          </h1>

          <div
            style={{
              opacity: 0.72,
              maxWidth: 700,
            }}
          >
            Operational visibility into ticket throughput, AI processing,
            grounded draft generation, and SLA health.
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            borderRadius: 14,
            border: "1px solid rgba(34,197,94,0.3)",
            background: "rgba(34,197,94,0.10)",
            fontWeight: 800,
          }}
        >
          System Health: {health}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 28,
        }}
      >
        <div style={cardStyle()}>
          <div style={{ opacity: 0.72 }}>Total Tickets</div>
          <div style={metricValueStyle()}>
            {metrics?.total_tickets ?? 0}
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ opacity: 0.72 }}>Open Tickets</div>
          <div style={metricValueStyle()}>
            {metrics?.open_tickets ?? 0}
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ opacity: 0.72 }}>Closed Tickets</div>
          <div style={metricValueStyle()}>
            {metrics?.closed_tickets ?? 0}
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ opacity: 0.72 }}>AI Completed</div>
          <div style={metricValueStyle()}>
            {metrics?.ai_completed ?? 0}
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ opacity: 0.72 }}>AI Failed</div>
          <div style={metricValueStyle()}>
            {metrics?.ai_failed ?? 0}
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ opacity: 0.72 }}>Drafts Generated</div>
          <div style={metricValueStyle()}>
            {metrics?.drafts_generated ?? 0}
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ opacity: 0.72 }}>Drafts Approved</div>
          <div style={metricValueStyle()}>
            {metrics?.drafts_approved ?? 0}
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ opacity: 0.72 }}>Overdue Tickets</div>
          <div style={metricValueStyle()}>
            {metrics?.overdue_tickets ?? 0}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 28,
          padding: 18,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Operational Notes</h2>

        <ul
          style={{
            lineHeight: 1.9,
            opacity: 0.88,
          }}
        >
          <li>AI analysis runs asynchronously with retry handling.</li>
          <li>Grounded drafts use approved knowledge base articles.</li>
          <li>Audit logs remain stored internally for traceability.</li>
          <li>Human approval is required before customer responses.</li>
          <li>SLA tracking highlights overdue operational risk.</li>
        </ul>
      </div>
    </main>
  );
}