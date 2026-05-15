import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Loader2 } from "lucide-react";
import { api, setToken } from "../api";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oidcAvailable, setOidcAvailable] = useState(false);

  useEffect(() => {
    fetch("/api/v1/health/ready")
      .then((r) => r.json())
      .then((d) => setOidcAvailable(Boolean(d?.features?.allow_public_oauth)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    const m = hash.match(/token=([^&]+)/);
    if (m && m[1]) {
      setToken(decodeURIComponent(m[1]));
      window.location.hash = "";
      nav("/");
    }
  }, [nav]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      }
      const tok = await api<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(tok.access_token);
      nav("/");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "var(--primary)",
              color: "#fff",
              borderRadius: 12,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "0.75rem",
            }}
          >
            <Mail size={24} />
          </div>
          <h1>Week Report</h1>
          <p>私有化周报生成工具</p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <button
            type="button"
            className={mode === "login" ? "btn btn-primary" : "btn"}
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => { setMode("login"); setErr(null); }}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === "register" ? "btn btn-primary" : "btn"}
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => { setMode("register"); setErr(null); }}
          >
            注册
          </button>
        </div>

        {err ? (
          <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
            <span>{err}</span>
          </div>
        ) : null}

        <form onSubmit={onSubmit}>
          <div className="form-group" style={{ marginBottom: "0.75rem" }}>
            <label>邮箱</label>
            <div style={{ position: "relative" }}>
              <Mail size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                style={{ paddingLeft: 34 }}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: "1.25rem" }}>
            <label>密码（至少 8 位）</label>
            <div style={{ position: "relative" }}>
              <Lock size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                minLength={8}
                required
                style={{ paddingLeft: 34 }}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? <Loader2 size={16} className="spin" /> : null}
            {loading ? "提交中…" : mode === "register" ? "注册并登录" : "登录"}
          </button>
        </form>

        {oidcAvailable ? (
          <>
            <div style={{ textAlign: "center", margin: "1rem 0", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              — 或 —
            </div>
            <a href="/api/v1/auth/oidc/login" style={{ display: "block" }}>
              <button type="button" className="btn" style={{ width: "100%", justifyContent: "center" }}>
                使用 OIDC 登录
              </button>
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}
