"use client";

import Link from "next/link";

const queueMetrics = [
  {
    label: "Open Tickets",
    value: "28",
    helper: "Currently active support cases",
  },
  {
    label: "Avg SLA Breach",
    value: "4.2%",
    helper: "Tickets exceeding SLA window",
  },
  {
    label: "AI Success Rate",
    value: "96%",
    helper: "Successful AI triage operations",
  },
  {
    label: "Avg AI Latency",
    value: "1.8s",
    helper: "Average AI processing duration",
  },
];

const healthChecks = [
  {
    service: "Ticket API",
    status: "Healthy",
  },
  {
    service: "AI Analysis Worker",
    status: "Healthy",
  },
  {
    service: "Knowledge Search",
    status: "Healthy",
  },
  {
    service: "Draft Generator",
    status: "Degraded",
  },
];

export default function MetricsPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
              Inbox Pilot
            </p>

            <h1 className="text-4xl font-bold mb-2">
              Operational Metrics
            </h1>

            <p className="text-sm text-gray-400">
              Live operational visibility for AI triage and support workflows.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/inbox"
              className="border border-white/20 px-4 py-2 rounded-xl text-sm hover:bg-white/10"
            >
              Inbox
            </Link>

            <Link
              href="/admin"
              className="border border-white/20 px-4 py-2 rounded-xl text-sm hover:bg-white/10"
            >
              Admin
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {queueMetrics.map((metric) => (
            <div
              key={metric.label}
              className="border border-white/10 rounded-2xl p-5 bg-white/[0.03]"
            >
              <p className="text-sm text-gray-400 mb-3">
                {metric.label}
              </p>

              <h2 className="text-3xl font-bold mb-2">
                {metric.value}
              </h2>

              <p className="text-xs text-gray-500">
                {metric.helper}
              </p>
            </div>
          ))}
        </div>

        <section className="border border-white/10 rounded-2xl overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02]">
            <h2 className="text-xl font-semibold">
              AI Health Checks
            </h2>
          </div>

          <div className="divide-y divide-white/10">
            {healthChecks.map((item) => (
              <div
                key={item.service}
                className="px-6 py-5 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">
                    {item.service}
                  </p>

                  <p className="text-sm text-gray-500">
                    Last checked 30 seconds ago
                  </p>
                </div>

                <span
                  className={`text-sm px-3 py-1 rounded-full border ${
                    item.status === "Healthy"
                      ? "border-green-500/30 text-green-300 bg-green-500/10"
                      : "border-yellow-500/30 text-yellow-300 bg-yellow-500/10"
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-6">
          <div className="border border-white/10 rounded-2xl p-6 bg-white/[0.03]">
            <h2 className="text-xl font-semibold mb-4">
              Queue Insights
            </h2>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Billing Queue Load</span>
                  <span>78%</span>
                </div>

                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[78%] bg-blue-500 rounded-full" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Refund Queue Load</span>
                  <span>52%</span>
                </div>

                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[52%] bg-purple-500 rounded-full" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Login Queue Load</span>
                  <span>31%</span>
                </div>

                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[31%] bg-green-500 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="border border-white/10 rounded-2xl p-6 bg-white/[0.03]">
            <h2 className="text-xl font-semibold mb-4">
              AI Pipeline Summary
            </h2>

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">
                  Drafts Generated
                </span>

                <span className="font-semibold">
                  142
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">
                  Human Approval Rate
                </span>

                <span className="font-semibold">
                  91%
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">
                  AI Retry Count
                </span>

                <span className="font-semibold">
                  7
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">
                  Failed Generations
                </span>

                <span className="font-semibold text-red-300">
                  2
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}