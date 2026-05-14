import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { GitConnection, ReportProfile, TemplatePreset } from "../types";

export default function ProfileEditPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const profileId = Number(id);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<GitConnection[]>([]);
  const [presets, setPresets] = useState<TemplatePreset[]>([]);

  const [name, setName] = useState("");
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
  const [hookUrl, setHookUrl] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [c, tp, prof] = await Promise.all([
          api<GitConnection[]>("/git-connections"),
          api<TemplatePreset[]>("/report-profiles/template-presets"),
          api<ReportProfile>(`/report-profiles/${profileId}`),
        ]);
        setConnections(c);
        setPresets(tp);
        setName(prof.name);
        setConnId(prof.git_connection_id);
        setRepos(prof.repo_full_names);
        setWindowDays(prof.window_days);
        const f = prof.filters || {};
        setIgnoreBots(f.ignore_bots !== false);
        setHideMerge(Boolean(f.hide_merge_commits));
        setHideSkipCi(Boolean(f.hide_skip_ci_commits));
        const st = prof.style || {};
        const pid = typeof st.template_preset === "string" ? st.template_preset : "default";
        setTemplatePreset(["default", "compact", "formal_zh"].includes(pid) ? pid : "default");
        setIncludePrs(prof.include_prs);
        setScheduleEnabled(prof.schedule_enabled);
        setScheduleCron(prof.schedule_cron || "0 9 * * 1");
        setScheduleTimezone(prof.schedule_timezone || "UTC");
        setCustomTemplate(typeof st.markdown_template === "string" ? st.markdown_template : "");
        setHookUrl(`${window.location.origin}/api/v1/public/hooks/report-profiles/${prof.hook_public_token}/runs`);
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [profileId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (connId === "") return;
    setErr(null);
    const style: Record<string, unknown> = { template_preset: templatePreset, language: "zh" };
    if (customTemplate.trim()) style.markdown_template = customTemplate.trim();
    try {
      await api<ReportProfile>(`/report-profiles/${profileId}`, {
        method: "PATCH",
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
      nav("/profiles");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "保存失败");
    }
  }

  if (loading) return <div className="content">加载中…</div>;

  return (
    <div>
      <h1 style={{ margin: "0 0 1rem" }}>✏️ 编辑档案 #{profileId}</h1>
      {err ? <p className="err">{err}</p> : null}

      <section className="card">
        <form onSubmit={save} className="row">
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
            仓库列表
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
            <textarea rows={4} value={customTemplate} onChange={(e) => setCustomTemplate(e.target.value)} placeholder="可选" />
          </label>
          <div style={{ width: "100%", display: "flex", gap: "0.75rem" }}>
            <button type="submit">保存修改</button>
            <button type="button" className="secondary" onClick={() => nav("/profiles")}>
              取消
            </button>
          </div>
        </form>
        {hookUrl ? (
          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e2e8f0", fontSize: "0.85rem", color: "#64748b" }}>
            <div>Webhook 地址（外部触发）:</div>
            <code style={{ wordBreak: "break-all" }}>{hookUrl}</code>
          </div>
        ) : null}
      </section>
    </div>
  );
}
