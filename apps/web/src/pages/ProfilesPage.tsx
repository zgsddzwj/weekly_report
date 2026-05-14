import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { GitConnection, ReportProfile, TemplatePreset } from "../types";

export default function ProfilesPage() {
  const [err, setErr] = useState<string | null>(null);
  const [connections, setConnections] = useState<GitConnection[]>([]);
  const [profiles, setProfiles] = useState<ReportProfile[]>([]);
  const [presets, setPresets] = useState<TemplatePreset[]>([]);

  const [name, setName] = useState("我的周报");
  const [connId, setConnId] = useState<number | "">("");
  const [repos, setRepos] = useState("");
  const [windowDays, setWindowDays] = useState(7);
  const [templatePreset, setTemplatePreset] = useState("default");
  const [ignoreBots, setIgnoreBots] = useState(true);
  const [hideMerge, setHideMerge] = useState(false);
  const [hideSkipCi, setHideSkipCi] = useState(false);
  const [includePrs, setIncludePrs] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState("0 9 * * 1");
  const [scheduleTimezone, setScheduleTimezone] = useState("Asia/Shanghai");
  const [customTemplate, setCustomTemplate] = useState("");

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [c, p, tp] = await Promise.all([
        api<GitConnection[]>("/git-connections"),
        api<ReportProfile[]>("/report-profiles"),
        api<TemplatePreset[]>("/report-profiles/template-presets"),
      ]);
      setConnections(c);
      setProfiles(p);
      setPresets(tp);
      setConnId((prev) => (prev === "" && c.length ? c[0].id : prev));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addProfile(e: FormEvent) {
    e.preventDefault();
    if (connId === "") return;
    setErr(null);
    const style: Record<string, unknown> = { language: "zh", template_preset: templatePreset };
    if (customTemplate.trim()) style.markdown_template = customTemplate.trim();
    try {
      await api<ReportProfile>("/report-profiles", {
        method: "POST",
        body: JSON.stringify({
          name,
          git_connection_id: connId,
          repo_full_names: repos,
          window_days: windowDays,
          filters: { ignore_bots: ignoreBots, hide_merge_commits: hideMerge, hide_skip_ci_commits: hideSkipCi },
          style,
          schedule_cron: scheduleEnabled ? scheduleCron : null,
          schedule_enabled: scheduleEnabled,
          schedule_timezone: scheduleTimezone,
          include_prs: includePrs,
        }),
      });
      setRepos("");
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "创建失败");
    }
  }

  async function remove(id: number) {
    if (!confirm("确定删除这条档案？")) return;
    setErr(null);
    try {
      await api(`/report-profiles/${id}`, { method: "DELETE" });
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "删除失败");
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 1rem" }}>📁 周报档案</h1>
      {err ? <p className="err">{err}</p> : null}

      <section className="card">
        <h2>新建档案</h2>
        {connections.length === 0 ? (
          <div className="empty">
            <p>
              还没有 Git 连接，先去 <Link to="/connections">添加连接</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={addProfile} className="row">
            <label>
              名称
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              使用连接
              <select value={connId} onChange={(e) => setConnId(Number(e.target.value))}>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.id} {c.label} ({c.provider})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1, minWidth: "18rem" }}>
              仓库列表（每行或逗号分隔，格式 owner/repo）
              <textarea rows={3} value={repos} onChange={(e) => setRepos(e.target.value)} required />
            </label>
            <label>
              回溯天数
              <input type="number" min={1} max={90} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} />
            </label>
            <label>
              内置模板
              <select value={templatePreset} onChange={(e) => setTemplatePreset(e.target.value)}>
                {presets.map((tp) => (
                  <option key={tp.id} value={tp.id} title={tp.description_zh}>
                    {tp.label_zh}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem" }}>
                <input type="checkbox" checked={ignoreBots} onChange={(e) => setIgnoreBots(e.target.checked)} />
                忽略机器人
              </label>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem" }}>
                <input type="checkbox" checked={hideMerge} onChange={(e) => setHideMerge(e.target.checked)} />
                隐藏 merge
              </label>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem" }}>
                <input type="checkbox" checked={hideSkipCi} onChange={(e) => setHideSkipCi(e.target.checked)} />
                隐藏 [skip ci]
              </label>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem" }}>
                <input type="checkbox" checked={includePrs} onChange={(e) => setIncludePrs(e.target.checked)} />
                包含 PR（GitHub）
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "0.5rem" }}>
              <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center", fontSize: "0.85rem" }}>
                <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
                定时生成（Celery Beat）
              </label>
              {scheduleEnabled ? (
                <>
                  <label>
                    Cron
                    <input value={scheduleCron} onChange={(e) => setScheduleCron(e.target.value)} placeholder="0 9 * * 1" style={{ width: "10rem" }} />
                  </label>
                  <label>
                    时区
                    <input value={scheduleTimezone} onChange={(e) => setScheduleTimezone(e.target.value)} placeholder="Asia/Shanghai" style={{ width: "10rem" }} />
                  </label>
                </>
              ) : null}
            </div>
            <label style={{ flex: 1, minWidth: "18rem" }}>
              自定义 Markdown 模板（留空使用内置；Jinja2 语法）
              <textarea rows={3} value={customTemplate} onChange={(e) => setCustomTemplate(e.target.value)} placeholder="可选" />
            </label>
            <button type="submit" disabled={!connections.length}>
              保存档案
            </button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>现有档案</h2>
        {profiles.length === 0 ? (
          <div className="empty">暂无档案</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>仓库</th>
                <th>时间窗</th>
                <th>定时</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td>#{p.id}</td>
                  <td>{p.name}</td>
                  <td style={{ fontSize: "0.8rem", color: "#64748b", maxWidth: "16rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.repo_full_names}
                  </td>
                  <td>{p.window_days} 天</td>
                  <td>{p.schedule_enabled ? "✅" : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <Link to={`/profiles/${p.id}/edit`}>
                        <button type="button" className="secondary sm">编辑</button>
                      </Link>
                      <button type="button" className="danger sm" onClick={() => remove(p.id)}>
                        删除
                      </button>
                    </div>
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
