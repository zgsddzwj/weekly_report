import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
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
  const [err, setErr] = useState<string | null>(null);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [limit, setLimit] = useState(50);
  const [detail, setDetail] = useState<ReportRun | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const r = await api<ReportRun[]>(`/reports?limit=${limit}`);
      setRuns(r);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "加载失败");
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
      <h1 style={{ margin: "0 0 1rem" }}>📋 报告历史</h1>
      {err ? <p className="err">{err}</p> : null}

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>运行记录</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <label style={{ margin: 0 }}>
              显示条数
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ minWidth: "5rem" }}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </label>
            <button type="button" className="secondary sm" onClick={() => refresh()}>
              刷新
            </button>
          </div>
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
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <button type="button" className="secondary sm" onClick={() => loadDetail(r.id)}>
                        详情
                      </button>
                      {r.status === "success" && r.result_markdown ? (
                        <button
                          type="button"
                          className="secondary sm"
                          onClick={() => downloadMarkdown(r.result_markdown!, `report-${r.id}.md`)}
                        >
                          下载
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

      {detail ? (
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h2 style={{ margin: 0 }}>任务 #{detail.id} 详情</h2>
            <button type="button" className="secondary sm" onClick={() => setDetail(null)}>
              关闭
            </button>
          </div>
          <p>
            状态：<StatusBadge status={detail.status} />
          </p>
          {detail.error_message ? <p className="err">{detail.error_message}</p> : null}
          {detail.result_markdown ? (
            <>
              <div style={{ marginBottom: "0.5rem" }}>
                <button
                  type="button"
                  className="secondary sm"
                  onClick={() => downloadMarkdown(detail.result_markdown!, `report-${detail.id}.md`)}
                >
                  ⬇️ 下载 .md
                </button>
              </div>
              <pre className="md">{detail.result_markdown}</pre>
            </>
          ) : (
            <p style={{ color: "#64748b" }}>暂无结果内容</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
