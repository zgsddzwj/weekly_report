import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, sseLines } from "../api";
import type { GitConnection, ReportProfile, ReportRun } from "../types";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "badge-pending",
    running: "badge-running",
    success: "badge-success",
    failed: "badge-failed",
  };
  return <span className={`badge ${map[status] || "badge-pending"}`}>{status}</span>;
}

export default function Dashboard() {
  const [err, setErr] = useState<string | null>(null);
  const [connections, setConnections] = useState<GitConnection[]>([]);
  const [profiles, setProfiles] = useState<ReportProfile[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [genProfileId, setGenProfileId] = useState<number | "">("");
  const [activeRun, setActiveRun] = useState<ReportRun | null>(null);

  const [showGuide, setShowGuide] = useState(() => {
    try {
      return localStorage.getItem("wr_guide_closed") !== "1";
    } catch {
      return true;
    }
  });

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [c, p, r] = await Promise.all([
        api<GitConnection[]>("/git-connections"),
        api<ReportProfile[]>("/report-profiles"),
        api<ReportRun[]>("/reports?limit=10"),
      ]);
      setConnections(c);
      setProfiles(p);
      setRuns(r);
      setGenProfileId((prev) => (prev === "" && p.length ? p[0].id : prev));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeRun || activeRun.status === "success" || activeRun.status === "failed") return;
    const runId = activeRun.id;
    let cancelled = false;
    async function listen() {
      try {
        for await (const line of sseLines(`/reports/${runId}/events`)) {
          if (cancelled) break;
          try {
            const payload = JSON.parse(line) as { status: string; result_markdown?: string; error_message?: string };
            if (payload.status === "success") {
              setActiveRun((prev) =>
                prev && prev.id === runId
                  ? { ...prev, status: "success", result_markdown: payload.result_markdown ?? prev.result_markdown }
                  : prev
              );
              void refresh();
              break;
            } else if (payload.status === "failed") {
              setActiveRun((prev) =>
                prev && prev.id === runId
                  ? { ...prev, status: "failed", error_message: payload.error_message ?? prev.error_message }
                  : prev
              );
              void refresh();
              break;
            } else {
              setActiveRun((prev) => (prev && prev.id === runId ? { ...prev, status: payload.status } : prev));
            }
          } catch {
            /* ignore malformed line */
          }
        }
      } catch {
        const t = window.setInterval(() => {
          api<ReportRun>(`/reports/${runId}`)
            .then((rr) => {
              setActiveRun(rr);
              if (rr.status === "success" || rr.status === "failed") void refresh();
            })
            .catch(() => {});
        }, 2000);
        return () => window.clearInterval(t);
      }
    }
    void listen();
    return () => {
      cancelled = true;
    };
  }, [activeRun, refresh]);

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
      void refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "生成失败");
    }
  }

  function downloadMarkdown(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const todayRuns = runs.filter((r) => {
    const d = new Date(r.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  return (
    <div>
      <h1 style={{ margin: "0 0 1rem" }}>📊 概览</h1>
      {err ? <p className="err">{err}</p> : null}

      {showGuide ? (
        <section className="card" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>📖 新手指南</h2>
            <button
              type="button"
              className="secondary sm"
              onClick={() => {
                setShowGuide(false);
                try {
                  localStorage.setItem("wr_guide_closed", "1");
                } catch {
                  /* ignore */
                }
              }}
            >
              关闭引导
            </button>
          </div>
          <ol style={{ paddingLeft: "1.25rem", margin: "0.75rem 0 0", color: "#334155", lineHeight: 1.7 }}>
            <li>
              <strong>添加 Git 连接</strong>：在「
              <Link to="/connections">Git 连接</Link>」页面填入你的平台 Token。
            </li>
            <li>
              <strong>创建周报档案</strong>：在「<Link to="/profiles">周报档案</Link>」页面选择连接、填写仓库列表（格式{" "}
              <code>owner/repo</code>）。
            </li>
            <li>
              <strong>一键生成周报</strong>：回到本页选择档案，点击「一键生成」。Worker 自动拉取提交并渲染 Markdown。
            </li>
            <li>
              <strong>查看与扩展</strong>：支持定时任务、Webhook、PR 汇总、自定义 Jinja2 模板等进阶功能。
            </li>
          </ol>
        </section>
      ) : (
        <div style={{ textAlign: "right", marginBottom: "0.75rem" }}>
          <button
            type="button"
            className="secondary sm"
            onClick={() => {
              setShowGuide(true);
              try {
                localStorage.removeItem("wr_guide_closed");
              } catch {
                /* ignore */
              }
            }}
          >
            📖 显示新手指南
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Git 连接</div>
          <div className="stat-value">{connections.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">周报档案</div>
          <div className="stat-value">{profiles.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">今日运行</div>
          <div className="stat-value">{todayRuns.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">最近成功</div>
          <div className="stat-value">
            {runs.filter((r) => r.status === "success").length}
          </div>
        </div>
      </div>

      {/* Quick generate */}
      <section className="card">
        <h2>⚡ 快速生成周报</h2>
        {profiles.length === 0 ? (
          <div className="empty">
            <p>
              还没有周报档案，先去 <Link to="/profiles">创建档案</Link> 吧
            </p>
          </div>
        ) : (
          <form onSubmit={generate} className="row">
            <label style={{ flex: 1 }}>
              选择档案
              <select
                value={genProfileId}
                onChange={(e) => setGenProfileId(Number(e.target.value))}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">一键生成</button>
          </form>
        )}

        {activeRun ? (
          <div style={{ marginTop: "1rem" }}>
            <p>
              任务 #{activeRun.id} 状态：<StatusBadge status={activeRun.status} />
            </p>
            {activeRun.error_message ? <p className="err">{activeRun.error_message}</p> : null}
            {activeRun.result_markdown ? (
              <>
                <div style={{ marginBottom: "0.5rem" }}>
                  <button
                    type="button"
                    className="secondary sm"
                    onClick={() => downloadMarkdown(activeRun.result_markdown!, `report-${activeRun.id}.md`)}
                  >
                    ⬇️ 下载 .md
                  </button>
                </div>
                <pre className="md">{activeRun.result_markdown}</pre>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Recent runs */}
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>🕐 最近运行</h2>
          <Link to="/reports" style={{ fontSize: "0.85rem" }}>
            查看全部 →
          </Link>
        </div>
        {runs.length === 0 ? (
          <div className="empty">暂无运行记录</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>档案</th>
                <th>状态</th>
                <th>触发</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td>{r.profile_id}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>{r.trigger_source}</td>
                  <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    {r.status === "success" && r.result_markdown ? (
                      <button
                        type="button"
                        className="secondary sm"
                        onClick={() => downloadMarkdown(r.result_markdown!, `report-${r.id}.md`)}
                      >
                        下载
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
