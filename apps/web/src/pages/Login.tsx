import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
      .then((d) => {
        setOidcAvailable(Boolean(d?.features?.allow_public_oauth));
      })
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
    <div style={{ maxWidth: 420, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Week Report</h1>
      <p style={{ color: "#64748b" }}>登录后配置 Git 连接与周报档案。</p>
      <div className="card">
        <div className="row" style={{ marginBottom: "0.75rem" }}>
          <button
            type="button"
            className={mode === "login" ? "" : "secondary"}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === "register" ? "" : "secondary"}
            onClick={() => setMode("register")}
          >
            注册
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <label style={{ marginBottom: "0.75rem" }}>
            邮箱
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label style={{ marginBottom: "0.75rem" }}>
            密码（至少 8 位）
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              minLength={8}
              required
            />
          </label>
          {err ? <p className="err">{err}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? "提交中…" : mode === "register" ? "注册并登录" : "登录"}
          </button>
        </form>
        {oidcAvailable ? (
          <>
            <div style={{ textAlign: "center", margin: "0.75rem 0", color: "#94a3b8" }}>— 或 —</div>
            <a href="/api/v1/auth/oidc/login" style={{ display: "block", textAlign: "center" }}>
              <button type="button" className="secondary" style={{ width: "100%" }}>
                使用 OIDC 登录
              </button>
            </a>
          </>
        ) : null}
      </div>
      <p style={{ marginTop: "1.5rem" }}>
        <Link to="/">返回首页</Link>（未登录会回到本页）
      </p>
    </div>
  );
}
