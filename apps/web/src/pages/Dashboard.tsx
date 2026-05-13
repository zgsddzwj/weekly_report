import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

type GitConnection = {
  id: number;
  provider: string;
  base_url: string;
  label: string;
  created_at: string;
};

type ReportProfile = {
  id: number;
  name: string;
  git_connection_id: number;
  repo_full_names: string;
  window_days: number;
  filters: Record<string, unknown>;
  style: Record<string, unknown>;
  created_at: string;
};

type ReportRun = {
  id: number;
  profile_id: number;
  status: string;
  result_markdown: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
};

export default function Dashboard() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [connections, setConnections] = useState<GitConnection[]>([]);
  const [profiles, setProfiles] = useState<ReportProfile[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);

  const [cProvider, setCProvider] = useState<"github" | "gitlab">("github");
  const [cBase, setCBase] = useState("https://api.github.com");
  const [cLabel, setCLabel] = useState("default");
  const [cToken, setCToken] = useState("");

  const [pName, setPName] = useState("我的周报");
  const [pConn, setPConn] = useState<number | "">("");
  const [pRepos, setPRepos] = useState("octocat/Hello-World");
  const [pDays, setPDays] = useState(7);

  const [genProfileId, setGenProfileId] = useState<number | "">("");
  const [activeRun, setActiveRun] = useState<ReportRun | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [c, p, r] = await Promise.all([
        api<GitConnection[]>("/git-connections"),
        api<ReportProfile[]>("/report-profiles"),
        api<ReportRun[]>("/reports?limit=30"),
      ]);
      setConnections(c);
      setProfiles(p);
      setRuns(r);
      setPConn((prev) => (prev === "" && c.length ? c[0].id : prev));
      setGenProfileId((prev) => (prev === "" && p.length ? p[0].id : prev));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (cProvider === "github") setCBase("https://api.github.com");
    else setCBase("https://gitlab.com/api/v4");
  }, [cProvider]);

  useEffect(() => {
    if (!activeRun || activeRun.status === "success" || activeRun.status === "failed") return;
    const t = window.setInterval(() => {
      api<ReportRun>(`/reports/${activeRun.id}`)
        .then((rr) => {
          setActiveRun(rr);
          if (rr.status === "success" || rr.status === "failed") {
            void refresh();
          }
        })
        .catch(() => {});
    }, 1500);
    return () => window.clearInterval(t);
  }, [activeRun, refresh]);

  async function addConnection(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api<GitConnection>("/git-connections", {
        method: "POST",
        body: JSON.stringify({
          provider: cProvider,
          base_url: cBase,
          label: cLabel,
          token: cToken,
        }),
      });
      setCToken("");
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "创建连接失败");
    }
  }

  async function addProfile(e: FormEvent) {
    e.preventDefault();
    if (pConn === "") return;
    setErr(null);
    try {
      await api<ReportProfile>("/report-profiles", {
        method: "POST",
        body: JSON.stringify({
          name: pName,
          git_connection_id: pConn,
          repo_full_names: pRepos,
          window_days: pDays,
          filters: { ignore_bots: true },
          style: { language: "zh" },
        }),
      });
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "创建档案失败");
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (genProfileId === "") return;
    setErr(null);
    try {
      const run = await api<ReportRun>("/reports", {
        method: "POST",
        body: JSON.stringify({ profile_id: genProfileId }),
      });
      setActiveRun(run);
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "生成失败");
    }
  }

  function logout() {
    setToken(null);
    nav("/login");
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "1.25rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Week Report</h1>
        <button type="button" className="secondary" onClick={logout}>
          退出
        </button>
      </header>
      {err ? <p className="err">{err}</p> : null}

      <section className="card">
        <h2>新建 Git 连接</h2>
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
          GitHub 使用 Fine-grained 或 classic PAT；GitLab 使用 Personal Access Token（需读仓库权限）。
        </p>
        <form onSubmit={addConnection} className="row">
          <label>
            平台
            <select value={cProvider} onChange={(e) => setCProvider(e.target.value as "github" | "gitlab")}>
              <option value="github">github</option>
              <option value="gitlab">gitlab</option>
            </select>
          </label>
          <label style={{ flex: 1, minWidth: "16rem" }}>
            API Base URL
            <input value={cBase} onChange={(e) => setCBase(e.target.value)} required />
          </label>
          <label>
            显示名
            <input value={cLabel} onChange={(e) => setCLabel(e.target.value)} required />
          </label>
          <label style={{ flex: 1, minWidth: "16rem" }}>
            Token
            <input value={cToken} onChange={(e) => setCToken(e.target.value)} type="password" required />
          </label>
          <button type="submit">保存连接</button>
        </form>
      </section>

      <section className="card">
        <h2>新建周报档案</h2>
        <form onSubmit={addProfile} className="row">
          <label>
            名称
            <input value={pName} onChange={(e) => setPName(e.target.value)} required />
          </label>
          <label>
            使用连接
            <select value={pConn} onChange={(e) => setPConn(Number(e.target.value))}>
              {connections.length === 0 ? <option value="">请先添加连接</option> : null}
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} {c.label} ({c.provider})
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, minWidth: "18rem" }}>
            仓库列表（每行或逗号分隔，格式 owner/repo）
            <textarea rows={4} value={pRepos} onChange={(e) => setPRepos(e.target.value)} required />
          </label>
          <label>
            回溯天数
            <input
              type="number"
              min={1}
              max={90}
              value={pDays}
              onChange={(e) => setPDays(Number(e.target.value))}
            />
          </label>
          <button type="submit" disabled={!connections.length}>
            保存档案
          </button>
        </form>
      </section>

      <section className="card">
        <h2>生成周报</h2>
        <form onSubmit={generate} className="row">
          <label>
            档案
            <select
              value={genProfileId}
              onChange={(e) => setGenProfileId(Number(e.target.value))}
              disabled={!profiles.length}
            >
              {profiles.length === 0 ? <option value="">请先创建档案</option> : null}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!profiles.length}>
            一键生成
          </button>
        </form>
        {activeRun ? (
          <div style={{ marginTop: "1rem" }}>
            <p>
              任务 #{activeRun.id} 状态：<strong>{activeRun.status}</strong>
            </p>
            {activeRun.error_message ? <p className="err">{activeRun.error_message}</p> : null}
            {activeRun.result_markdown ? <pre className="md">{activeRun.result_markdown}</pre> : null}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>最近运行</h2>
        <button type="button" className="secondary" onClick={() => refresh().catch(() => {})}>
          刷新列表
        </button>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.75rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "0.35rem" }}>ID</th>
              <th>档案</th>
              <th>状态</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.35rem" }}>{r.id}</td>
                <td>{r.profile_id}</td>
                <td>{r.status}</td>
                <td>{r.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
