import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList, Download, Eye, X, Loader2, AlertCircle
} from "lucide-react";
import { api } from "../api";
import { useToast } from "../components/Toast";
import type { ReportRun } from "../types";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "badge-pending",
    running: "badge-running",
    success: "badge-success",
    failed: "badge-failed",
  };
  return <span className={`badge ${map[status] || "badge-pending"}`}>{status}</span>;
}

export default function ReportsPage() {
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [detail, setDetail] = useState<ReportRun | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await api<ReportRun[]>(`/reports?limit=${limit}`);
      setRuns(r);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  async function loadDetail(id: number) {
    try {
      const r = await api<ReportRun>(`/reports/${id}`);
      setDetail(r);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "加载详情失败");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>📋 报告历史</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            每页
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ minWidth: "4rem" }}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            条
          </label>
          <button className="btn btn-sm" onClick={() => refresh()}>
            刷新
          </button>
        </div>
      </div>

      {err ? <div className="alert alert-error"><AlertCircle size={16} /><span>{err}</span></div> : null}

      <section className="card">
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
            <Loader2 size={24} className="spin" />
          </div>
        ) : runs.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={40} />
            <h3>暂无运行记录</h3>
            <p>去概览页生成你的第一份周报吧</p>
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
                  <td style={{ fontSize: "0.8rem" }}>{r.trigger_source}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <button className="btn btn-sm btn-icon" onClick={() => loadDetail(r.id)} title="查看详情">
                        <Eye size={14} />
                      </button>
                      {r.status === "success" && r.result_markdown ? (
                        <button className="btn btn-sm btn-icon" onClick={() => downloadMarkdown(r.result_markdown!, `report-${r.id}.md`)} title="下载">
                          <Download size={14} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {detail && (
        <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="dialog">
            <div className="dialog-header">
              <h3>任务 #{detail.id} 详情</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>
            <div className="dialog-body">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <span>状态</span>
                <StatusBadge status={detail.status} />
              </div>
              {detail.error_message ? (
                <div className="alert alert-error" style={{ marginBottom: "0.75rem" }}>
                  <AlertCircle size={14} />{detail.error_message}
                </div>
              ) : null}
              {detail.result_markdown ? (
                <>
                  <div style={{ marginBottom: "0.5rem", display: "flex", gap: "0.5rem" }}>
                    <button className="btn btn-sm" onClick={() => downloadMarkdown(detail.result_markdown!, `report-${detail.id}.md`)}>
                      <Download size={14} /> 下载 .md
                    </button>
                  </div>
                  <pre className="md-preview">{detail.result_markdown}</pre>
                </>
              ) : (
                <p style={{ color: "var(--text-muted)" }}>暂无结果内容</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
