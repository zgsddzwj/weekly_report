import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Link2, FolderOpen, ClipboardList, CheckCircle, AlertCircle,
  Clock, Zap, Download, Loader2, ChevronRight, X
} from "lucide-react";
import { api, sseLines } from "../api";
import { useToast } from "../components/Toast";
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
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [connections, setConnections] = useState<GitConnection[]>([]);
  const [profiles, setProfiles] = useState<ReportProfile[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [loading, setLoading] = useState(true);
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
    } finally {
      setLoading(false);
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
              toast.showSuccess("周报生成成功！");
              break;
            } else if (payload.status === "failed") {
              setActiveRun((prev) =>
                prev && prev.id === runId
                  ? { ...prev, status: "failed", error_message: payload.error_message ?? prev.error_message }
                  : prev
              );
              void refresh();
              toast.showError("周报生成失败");
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
    return () => { cancelled = true; };
  }, [activeRun, refresh, toast]);

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
    toast.showSuccess("下载成功");
  }

  const todayRuns = runs.filter((r) => {
    const d = new Date(r.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  if (loading) {
    return (
      <div className="page-content">
        <div className="page-header"><h1>📊 概览</h1></div>
        <div className="stat-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card"><div style={{ height: 60, background: "var(--border)", borderRadius: 6 }} /></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>📊 概览</h1>
        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          {new Date().toLocaleDateString("zh-CN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </span>
      </div>

      {err ? <div className="alert alert-error"><AlertCircle size={16} /><span>{err}</span></div> : null}

      {showGuide ? (
        <section className="card guide-card">
          <div className="card-header">
            <div>
              <h3>📖 新手指南</h3>
              <div className="card-subtitle">4 步快速上手 Week Report</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => {
                setShowGuide(false);
                try { localStorage.setItem("wr_guide_closed", "1"); } catch {}
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
            {[
              { num: 1, title: "添加 Git 连接", desc: "在连接管理页填入 PAT Token", link: "/connections" },
              { num: 2, title: "创建周报档案", desc: "选择连接、填写仓库列表", link: "/profiles" },
              { num: 3, title: "一键生成周报", desc: "Worker 自动拉取并渲染 Markdown", link: "" },
              { num: 4, title: "查看与扩展", desc: "支持定时任务、Webhook、PR 汇总", link: "" },
            ].map((s) => (
              <div key={s.num} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", background: "var(--primary)", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, flexShrink: 0
                }}>{s.num}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{s.title}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{s.desc}</div>
                  {s.link ? <Link to={s.link} className="link-btn">去设置 <ChevronRight size={12} /></Link> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div style={{ textAlign: "right", marginBottom: "0.75rem" }}>
          <button className="btn btn-sm" onClick={() => { setShowGuide(true); try { localStorage.removeItem("wr_guide_closed"); } catch {} }}>
            📖 显示新手指南
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon blue"><Link2 size={20} /></div>
          <div>
            <div className="stat-value">{connections.length}</div>
            <div className="stat-label">Git 连接</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><FolderOpen size={20} /></div>
          <div>
            <div className="stat-value">{profiles.length}</div>
            <div className="stat-label">周报档案</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><Clock size={20} /></div>
          <div>
            <div className="stat-value">{todayRuns.length}</div>
            <div className="stat-label">今日运行</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={20} /></div>
          <div>
            <div className="stat-value">{runs.filter((r) => r.status === "success").length}</div>
            <div className="stat-label">累计成功</div>
          </div>
        </div>
      </div>

      {/* Quick generate */}
      <section className="card">
        <div className="card-header"><h2><Zap size={16} style={{ verticalAlign: "-2px" }} /> 快速生成周报</h2></div>
        {profiles.length === 0 ? (
          <div className="empty-state">
            <FolderOpen size={40} />
            <h3>还没有周报档案</h3>
            <p>先去 <Link to="/profiles" className="link-btn">创建档案</Link> 吧</p>
          </div>
        ) : (
          <>
            <form onSubmit={generate} className="form-row">
              <label style={{ flex: 1, minWidth: "16rem" }}>
                选择档案
                <select value={genProfileId} onChange={(e) => setGenProfileId(Number(e.target.value))}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>#{p.id} {p.name}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn btn-primary">
                <Zap size={16} /> 一键生成
              </button>
            </form>
            {activeRun ? (
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span>任务 #{activeRun.id}</span>
                  <StatusBadge status={activeRun.status} />
                  {activeRun.status === "running" ? <Loader2 size={14} className="spin" /> : null}
                </div>
                {activeRun.error_message ? <div className="alert alert-error" style={{ marginBottom: "0.5rem" }}><AlertCircle size={14} />{activeRun.error_message}</div> : null}
                {activeRun.result_markdown ? (
                  <>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <button className="btn btn-sm" onClick={() => downloadMarkdown(activeRun.result_markdown!, `report-${activeRun.id}.md`)}>
                        <Download size={14} /> 下载 .md
                      </button>
                    </div>
                    <pre className="md-preview">{activeRun.result_markdown}</pre>
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* Recent runs */}
      <section className="card">
        <div className="card-header">
          <h2><ClipboardList size={16} style={{ verticalAlign: "-2px" }} /> 最近运行</h2>
          <Link to="/reports" className="link-btn">查看全部 →</Link>
        </div>
        {runs.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={40} />
            <h3>暂无运行记录</h3>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>ID</th><th>档案</th><th>状态</th><th>触发</th><th>时间</th><th>操作</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td>{r.profile_id}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.trigger_source}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    {r.status === "success" && r.result_markdown ? (
                      <button className="btn btn-sm" onClick={() => downloadMarkdown(r.result_markdown!, `report-${r.id}.md`)}>
                        <Download size={14} />
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
