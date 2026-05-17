"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Rule = {
  id: number;
  name: string;
  category: string;
  priority: string;
  assignTo: string;
  slaHours: number;
  enabled: boolean;
};

const initialRules: Rule[] = [
  {
    id: 1,
    name: "Billing escalation",
    category: "billing",
    priority: "high",
    assignTo: "Sam",
    slaHours: 4,
    enabled: true,
  },
  {
    id: 2,
    name: "Login recovery",
    category: "login",
    priority: "medium",
    assignTo: "Alex",
    slaHours: 24,
    enabled: true,
  },
  {
    id: 3,
    name: "Refund review",
    category: "refund",
    priority: "high",
    assignTo: "Riya",
    slaHours: 12,
    enabled: false,
  },
];

export default function AdminPage() {
  const [rules, setRules] = useState(initialRules);

  const enabledCount = useMemo(
    () => rules.filter((rule) => rule.enabled).length,
    [rules]
  );

  function toggleRule(id: number) {
    setRules((prev) =>
      prev.map((rule) =>
        rule.id === id
          ? { ...rule, enabled: !rule.enabled }
          : rule
      )
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
              Inbox Pilot
            </p>

            <h1 className="text-4xl font-bold mb-2">
              Admin Controls
            </h1>

            <p className="text-sm text-gray-400">
              Configure routing logic, ownership rules, and SLA policies.
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
              href="/metrics"
              className="border border-white/20 px-4 py-2 rounded-xl text-sm hover:bg-white/10"
            >
              Metrics
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.03]">
            <p className="text-sm text-gray-400 mb-2">
              Total Rules
            </p>

            <h2 className="text-3xl font-bold">
              {rules.length}
            </h2>
          </div>

          <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.03]">
            <p className="text-sm text-gray-400 mb-2">
              Active Rules
            </p>

            <h2 className="text-3xl font-bold text-green-400">
              {enabledCount}
            </h2>
          </div>

          <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.03]">
            <p className="text-sm text-gray-400 mb-2">
              AI Routing Status
            </p>

            <h2 className="text-3xl font-bold text-blue-400">
              Healthy
            </h2>
          </div>
        </div>

        <section className="border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02]">
            <h2 className="text-xl font-semibold">
              Routing Rules
            </h2>
          </div>

          <div className="divide-y divide-white/10">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold text-lg">
                      {rule.name}
                    </h3>

                    <span
                      className={`text-xs px-3 py-1 rounded-full border ${
                        rule.enabled
                          ? "border-green-500/30 text-green-300 bg-green-500/10"
                          : "border-red-500/30 text-red-300 bg-red-500/10"
                      }`}
                    >
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="border border-white/10 px-3 py-1 rounded-full">
                      Category: {rule.category}
                    </span>

                    <span className="border border-white/10 px-3 py-1 rounded-full">
                      Priority: {rule.priority}
                    </span>

                    <span className="border border-white/10 px-3 py-1 rounded-full">
                      Assign: {rule.assignTo}
                    </span>

                    <span className="border border-white/10 px-3 py-1 rounded-full">
                      SLA: {rule.slaHours}h
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => toggleRule(rule.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    rule.enabled
                      ? "bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20"
                      : "bg-green-500/10 border border-green-500/30 text-green-300 hover:bg-green-500/20"
                  }`}
                >
                  {rule.enabled ? "Disable Rule" : "Enable Rule"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}