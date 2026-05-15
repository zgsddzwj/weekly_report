import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link2, Plus, Trash2, Globe, ExternalLink, ArrowRight, CheckCircle } from "lucide-react";
import { api } from "../api";
import { useToast } from "../components/Toast";
import type { GitConnection } from "../types";

export default function ConnectionsPage() {
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [connections, setConnections] = useState<GitConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [provider, setProvider] = useState<"github" | "gitlab" | "gitee">("github");
  const [baseUrl, setBaseUrl] = useState("https://api.github.com");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const c = await api<GitConnection[]>("/git-connections");
      setConnections(c);
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
    if (provider === "github") setBaseUrl("https://api.github.com");
    else if (provider === "gitlab") setBaseUrl("https://gitlab.com/api/v4");
    else setBaseUrl("https://gitee.com/api/v5");
  }, [provider]);

  async function addConnection(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api<GitConnection>("/git-connections", {
        method: "POST",
        body: JSON.stringify({ provider, base_url: baseUrl, label, token }),
      });
      setToken("");
      setLabel("");
      setShowForm(false);
      toast.showSuccess("连接添加成功");
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "创建失败");
    }
  }

  async function remove(id: number) {
    if (!confirm("确定删除这条连接？关联的档案将无法使用。")) return;
    setErr(null);
    try {
      await api(`/git-connections/${id}`, { method: "DELETE" });
      toast.showSuccess("连接已删除");
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "删除失败");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Git 连接</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> {showForm ? "取消" : "新建连接"}
        </button>
      </div>

      {err ? <div className="alert alert-error"><span>{err}</span></div> : null}

      {showForm && (
        <section className="card" style={{ border: "1.5px solid #c7d2fe", background: "linear-gradient(135deg, #fff 0%, #eef2ff 100%)" }}>
          <div className="card-header"><h2>新建 Git 连接</h2></div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
            Token 会被加密存储，不会以明文显示。{" "}
            <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontWeight: 500 }}>
              去 GitHub 生成 Token <ExternalLink size={12} style={{ verticalAlign: "-1px" }} />
            </a>
          </p>
          <form onSubmit={addConnection} className="form-grid">
            <div className="form-group">
              <label>平台</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value as "github" | "gitlab" | "gitee")}>
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
                <option value="gitee">Gitee</option>
              </select>
            </div>
            <div className="form-group">
              <label>显示名</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="如：公司 GitHub" />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label>API Base URL</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label>Personal Access Token</label>
              <input value={token} onChange={(e) => setToken(e.target.value)} type="password" required placeholder="ghp_xxx 或 glpat-xxx" />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="btn btn-primary"><Plus size={16} /> 保存连接</button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <div className="card-header"><h2>现有连接</h2></div>
        {loading ? (
          <div style={{ height: 120, background: "var(--border)", borderRadius: 6 }} />
        ) : connections.length === 0 ? (
          <div className="empty-state">
            <Link2 size={48} style={{ color: "var(--primary)", opacity: 0.3 }} />
            <h3>暂无连接</h3>
            <p>点击右上角「新建连接」添加你的第一个 Git 平台</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>平台</th><th>显示名</th><th>API 地址</th><th>创建时间</th><th style={{ width: 80 }}>操作</th></tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="badge" style={{ textTransform: "uppercase", fontSize: "0.7rem", background: "var(--primary-light)", color: "var(--primary)" }}>
                      {c.provider}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{c.label}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    <Globe size={12} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                    {c.base_url}
                  </td>
                  <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(c.id)} title="删除">
                      <Trash2 size={14} />
                    </button>
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
