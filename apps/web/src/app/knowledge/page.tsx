"use client";

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type KnowledgeArticle = {
  id: number;
  title: string;
  body: string;
  category: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
const CATEGORIES = ["all", "billing", "login", "refund", "other"];

function topBtn(primary = false): CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: primary ? "rgba(59,130,246,0.22)" : "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  };
}

function cardStyle(): CSSProperties {
  return {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
  };
}

function inputStyle(): CSSProperties {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    outline: "none",
    boxSizing: "border-box",
  };
}

function pillStyle(active = false): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    border: active ? "1px solid rgba(59,130,246,0.55)" : "1px solid rgba(255,255,255,0.14)",
    background: active ? "rgba(59,130,246,0.22)" : "rgba(255,255,255,0.06)",
    color: "white",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function KnowledgePageContent() {
  const router = useRouter();
  const sp = useSearchParams();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [qInput, setQInput] = useState(sp.get("q") || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("other");
  const [tags, setTags] = useState("");

  const q = sp.get("q") || "";
  const selectedCategory = sp.get("category") || "all";

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();

    if (q) qs.set("q", q);
    if (selectedCategory !== "all") qs.set("category", selectedCategory);

    qs.set("active", "true");
    qs.set("limit", "50");
    qs.set("offset", "0");

    return qs;
  }, [q, selectedCategory]);

  function setQS(patch: Record<string, string | null>) {
    const qs = new URLSearchParams(sp.toString());

    Object.entries(patch).forEach(([key, value]) => {
      if (!value) qs.delete(key);
      else qs.set(key, value);
    });

    const next = qs.toString();
    router.push(next ? `/knowledge?${next}` : "/knowledge");
  }

  useEffect(() => {
    setQInput(sp.get("q") || "");
  }, [sp]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || null;

      setAccessToken(token);
      setSessionChecked(true);

      if (!token) {
        router.push("/login");
      }
    })();
  }, [router]);

  async function fetchArticles() {
    if (!accessToken) return;

    try {
      setLoading(true);
      setErr(null);

      const res = await fetch(`${API_BASE}/knowledge?${queryString.toString()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text}`);
      }

      const data = (await res.json()) as KnowledgeArticle[];
      setArticles(data);
    } catch (e: any) {
      setErr(e?.message || "Failed to load knowledge base");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!sessionChecked || !accessToken) return;
    fetchArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, accessToken, queryString]);

  async function createArticle() {
    if (!accessToken) return;

    const cleanTitle = title.trim();
    const cleanBody = body.trim();

    if (cleanTitle.length < 3) {
      alert("Title must be at least 3 characters.");
      return;
    }

    if (cleanBody.length < 10) {
      alert("Body must be at least 10 characters.");
      return;
    }

    const tagList = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      setCreating(true);

      const res = await fetch(`${API_BASE}/knowledge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: cleanTitle,
          body: cleanBody,
          category,
          tags: tagList,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text}`);
      }

      setTitle("");
      setBody("");
      setCategory("other");
      setTags("");
      setCreateOpen(false);

      await fetchArticles();
    } catch (e: any) {
      alert(e?.message || "Failed to create article");
    } finally {
      setCreating(false);
    }
  }

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
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.85 }}>INBOX PILOT</div>
            <h1 style={{ fontSize: 34, margin: "6px 0 6px", fontWeight: 900 }}>Knowledge Base</h1>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Approved support knowledge used for grounded AI draft generation.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => router.push("/inbox")} style={topBtn(false)}>
              Inbox
            </button>
            <button onClick={() => setCreateOpen(true)} style={topBtn(true)}>
              New Article
            </button>
            <button onClick={logout} style={topBtn(false)}>
              Logout
            </button>
          </div>
        </div>

        <section style={cardStyle()}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQS({ q: qInput.trim() || null });
              }}
              placeholder="Search title, body, or tags..."
              style={{ ...inputStyle(), flex: "1 1 420px" }}
            />
            <button onClick={() => setQS({ q: qInput.trim() || null })} style={topBtn(false)}>
              Search
            </button>
            <button
              onClick={() => {
                setQInput("");
                router.push("/knowledge");
              }}
              style={topBtn(false)}
            >
              Reset
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {CATEGORIES.map((item) => (
              <button
                key={item}
                onClick={() => setQS({ category: item === "all" ? null : item })}
                style={pillStyle(selectedCategory === item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {createOpen && (
          <section style={cardStyle()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Create Knowledge Article</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.75, fontSize: 13 }}>
                  Add approved support guidance that AI can use for grounded drafts.
                </p>
              </div>
              <button onClick={() => setCreateOpen(false)} style={topBtn(false)}>
                Cancel
              </button>
            </div>

            <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
              <label>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6, fontWeight: 800 }}>Title</div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle()} />
              </label>

              <label>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6, fontWeight: 800 }}>Body</div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  style={{ ...inputStyle(), resize: "vertical", lineHeight: 1.45 }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <label>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6, fontWeight: 800 }}>Category</div>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle()}>
                    {CATEGORIES.filter((item) => item !== "all").map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6, fontWeight: 800 }}>Tags</div>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="payment, billing, failed"
                    style={inputStyle()}
                  />
                </label>
              </div>

              <button onClick={createArticle} disabled={creating} style={topBtn(true)}>
                {creating ? "Creating..." : "Create Article"}
              </button>
            </div>
          </section>
        )}

        <section style={cardStyle()}>
          <h2 style={{ fontSize: 19, margin: 0 }}>Articles</h2>
          <p style={{ marginTop: 5, marginBottom: 12, opacity: 0.72, fontSize: 13 }}>
            These articles are used to generate grounded support drafts.
          </p>

          {loading && <p>Loading knowledge articles...</p>}
          {err && <p style={{ color: "#fca5a5" }}>{err}</p>}

          {!loading && !err && articles.length === 0 && (
            <div style={{ padding: 18, borderRadius: 12, background: "rgba(255,255,255,0.04)", opacity: 0.8 }}>
              No knowledge articles found. Create one to support grounded draft generation.
            </div>
          )}

          {!loading && !err && articles.length > 0 && (
            <div style={{ display: "grid", gap: 12 }}>
              {articles.map((article) => (
                <article
                  key={article.id}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.035)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 17 }}>
                        #{article.id} — {article.title}
                      </h3>
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <span style={pillStyle(false)}>{article.category}</span>
                        <span style={pillStyle(false)}>{article.is_active ? "active" : "inactive"}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>Updated: {formatDate(article.updated_at)}</div>
                  </div>

                  <p style={{ marginTop: 13, lineHeight: 1.5, opacity: 0.92 }}>{article.body}</p>

                  {article.tags?.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {article.tags.map((tag) => (
                        <span key={`${article.id}-${tag}`} style={pillStyle(false)}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function KnowledgePage() {
  return (
    <Suspense fallback={<main style={{ padding: 24, fontFamily: "system-ui" }}>Loading knowledge base...</main>}>
      <KnowledgePageContent />
    </Suspense>
  );
}
