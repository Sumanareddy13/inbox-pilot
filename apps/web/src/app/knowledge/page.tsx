"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function KnowledgePage() {
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

    router.push(`/knowledge?${qs.toString()}`);
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.85 }}>INBOX PILOT</div>
            <h1 style={{ fontSize: 34, margin: "6px 0 6px", fontWeight: 900 }}>Knowledge Base</h1>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Approved support knowledge used later for grounded AI draft generation.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
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

        <section
          style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.035)",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search title, body, or tags..."
              style={inputStyle}
            />

            <button onClick={() => setQS({ q: qInput.trim() || null })} style={actionBtn()}>
              Search
            </button>

            <button
              onClick={() => {
                setQInput("");
                setQS({ q: null, category: null });
              }}
              style={actionBtn()}
            >
              Reset
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;

              return (
                <button
                  key={cat}
                  onClick={() => setQS({ category: cat === "all" ? null : cat })}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 999,
                    border: active
                      ? "1px solid rgba(59,130,246,0.65)"
                      : "1px solid rgba(255,255,255,0.16)",
                    background: active ? "rgba(59,130,246,0.20)" : "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </section>

        <section
          style={{
            marginTop: 16,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.03)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontWeight: 900 }}>Articles</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              These articles will be used in the next phase to generate grounded support drafts.
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 16, opacity: 0.85 }}>Loading knowledge base…</div>
          ) : err ? (
            <div style={{ padding: 16, color: "tomato" }}>
              {err}
              <div style={{ marginTop: 10 }}>
                <button onClick={fetchArticles} style={actionBtn()}>
                  Retry
                </button>
              </div>
            </div>
          ) : articles.length === 0 ? (
            <div style={{ padding: 16, opacity: 0.85 }}>
              No knowledge articles found. Create one to start grounding AI drafts.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12, padding: 14 }}>
              {articles.map((article) => (
                <article
                  key={article.id}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.035)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>
                        #{article.id} — {article.title}
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={pillStyle()}>{article.category}</span>
                        <span style={pillStyle()}>{article.is_active ? "active" : "inactive"}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.72 }}>
                      Updated: {new Date(article.updated_at).toLocaleString()}
                    </div>
                  </div>

                  <p style={{ marginTop: 12, lineHeight: 1.55, opacity: 0.9 }}>{article.body}</p>

                  {article.tags.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {article.tags.map((tag) => (
                        <span key={tag} style={pillStyle()}>
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

      {createOpen && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>Create Knowledge Article</div>
                <div style={{ fontSize: 13, opacity: 0.76, marginTop: 4 }}>
                  Add approved support guidance for future AI drafts.
                </div>
              </div>

              <button onClick={() => setCreateOpen(false)} style={closeBtnStyle}>
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              <div>
                <div style={labelStyle}>Title</div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Example: Payment failure troubleshooting"
                  style={modalInputStyle}
                />
              </div>

              <div>
                <div style={labelStyle}>Body</div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write the approved support guidance..."
                  rows={7}
                  style={{ ...modalInputStyle, resize: "vertical" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={labelStyle}>Category</div>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={modalInputStyle}>
                    <option value="billing">billing</option>
                    <option value="login">login</option>
                    <option value="refund">refund</option>
                    <option value="other">other</option>
                  </select>
                </div>

                <div>
                  <div style={labelStyle}>Tags</div>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="payment, billing, failed"
                    style={modalInputStyle}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button onClick={() => setCreateOpen(false)} style={actionBtn()}>
                Cancel
              </button>
              <button onClick={createArticle} disabled={creating} style={topBtn(true)}>
                {creating ? "Creating..." : "Create Article"}
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
    fontWeight: 800,
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
    fontWeight: 800,
  };
}

function pillStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 9px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    fontWeight: 800,
    color: "white",
  };
}

const inputStyle: React.CSSProperties = {
  flex: "1 1 360px",
  minWidth: 280,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  outline: "none",
};

const modalInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "white",
  outline: "none",
  boxSizing: "border-box",
};

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
  maxWidth: 680,
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
  fontWeight: 800,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.82,
  marginBottom: 6,
  fontWeight: 800,
};