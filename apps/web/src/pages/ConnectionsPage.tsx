import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { GitConnection } from "../types";

export default function ConnectionsPage() {
  const [err, setErr] = useState<string | null>(null);
  const [connections, setConnections] = useState<GitConnection[]>([]);
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
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "创建失败");
    }
  }

  async function remove(id: number) {
    if (!confirm("确定删除这条连接？")) return;
    setErr(null);
    try {
      await api(`/git-connections/${id}`, { method: "DELETE" });
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "删除失败");
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 1rem" }}>🔗 Git 连接</h1>
      {err ? <p className="err">{err}</p> : null}

      <section className="card">
        <h2>新建连接</h2>
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
          GitHub 使用{" "}
          <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
            Fine-grained 或 classic PAT
          </a>
          ；GitLab 使用 Personal Access Token（需读仓库权限）。Token 会被加密存储。
        </p>
        <form onSubmit={addConnection} className="row">
          <label>
            平台
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as "github" | "gitlab" | "gitee")}
            >
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="gitee">Gitee</option>
            </select>
          </label>
          <label style={{ flex: 1, minWidth: "16rem" }}>
            API Base URL
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
          </label>
          <label>
            显示名
            <input value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="如：公司 GitHub" />
          </label>
          <label style={{ flex: 1, minWidth: "16rem" }}>
            Token
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              required
              placeholder="ghp_xxx 或 glpat-xxx"
            />
          </label>
          <button type="submit">保存连接</button>
        </form>
      </section>

      <section className="card">
        <h2>现有连接</h2>
        {connections.length === 0 ? (
          <div className="empty">暂无连接，请先在上方添加</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>平台</th>
                <th>显示名</th>
                <th>API 地址</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id}>
                  <td>#{c.id}</td>
                  <td>{c.provider}</td>
                  <td>{c.label}</td>
                  <td style={{ fontSize: "0.8rem", color: "#64748b", maxWidth: "20rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.base_url}
                  </td>
                  <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{new Date(c.created_at).toLocaleString()}</td>
                  <td>
                    <button type="button" className="danger sm" onClick={() => remove(c.id)}>
                      删除
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
