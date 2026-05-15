import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Save, X, Globe, Copy, CheckCircle, Sparkles } from "lucide-react";
import { api } from "../api";
import { useToast } from "../components/Toast";
import type { GitConnection, ReportProfile, TemplatePreset } from "../types";

const tabs = ["基本信息", "过滤规则", "模板与定时", "Webhook"];

export default function ProfileEditPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const toast = useToast();
  const profileId = Number(id);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(0);
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
  const [llmGenerate, setLlmGenerate] = useState(false);
  const [hookUrl, setHookUrl] = useState("");
  const [copied, setCopied] = useState(false);

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
        setLlmGenerate(prof.llm_generate);
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
    setSaving(true);
    setErr(null);
    const style: Record<string, unknown> = { template_preset: templatePreset, language: "zh" };
    if (customTemplate.trim()) style.markdown_template = customTemplate.trim();
    try {
      await api<ReportProfile>(`/report-profiles/${profileId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name, git_connection_id: connId, repo_full_names: repos, window_days: windowDays,
          filters: { ignore_bots: ignoreBots, hide_merge_commits: hideMerge, hide_skip_ci_commits: hideSkipCi },
          style,
          schedule_cron: scheduleEnabled ? scheduleCron : null,
          schedule_enabled: scheduleEnabled,
          schedule_timezone: scheduleTimezone,
          include_prs: includePrs,
          llm_generate: llmGenerate,
        }),
      });
      toast.showSuccess("保存成功");
      nav("/profiles");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function copyHook() {
    try {
      await navigator.clipboard.writeText(hookUrl);
      setCopied(true);
      toast.showSuccess("Webhook 地址已复制");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.showError("复制失败");
    }
  }

  if (loading) return <div className="page-content">加载中…</div>;

  return (
    <div>
      <div className="page-header">
        <h1>编辑档案 #{profileId}</h1>
        <button className="btn" onClick={() => nav("/profiles")}><X size={16} /> 取消</button>
      </div>

      {err ? <div className="alert alert-error"><span>{err}</span></div> : null}

      <section className="card" style={{ border: "1.5px solid #c7d2fe" }}>
        <div className="tabs">
          {tabs.map((t, i) => (
            <button key={i} className={`tab ${tab === i ? "active" : ""}`} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>

        <form onSubmit={save}>
          {tab === 0 && (
            <div className="form-grid">
              <div className="form-group">
                <label>档案名称</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>使用连接</label>
                <select value={connId} onChange={(e) => setConnId(Number(e.target.value))}>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>#{c.id} {c.label} ({c.provider})</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>仓库列表</label>
                <textarea rows={3} value={repos} onChange={(e) => setRepos(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>回溯天数</label>
                <input type="number" min={1} max={90} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>内置模板</label>
                <select value={templatePreset} onChange={(e) => setTemplatePreset(e.target.value)}>
                  {presets.map((tp) => (
                    <option key={tp.id} value={tp.id} title={tp.description_zh}>{tp.label_zh}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {tab === 1 && (
            <div className="checkbox-row">
              <label><input type="checkbox" checked={ignoreBots} onChange={(e) => setIgnoreBots(e.target.checked)} /> 忽略机器人提交</label>
              <label><input type="checkbox" checked={hideMerge} onChange={(e) => setHideMerge(e.target.checked)} /> 隐藏 merge 提交</label>
              <label><input type="checkbox" checked={hideSkipCi} onChange={(e) => setHideSkipCi(e.target.checked)} /> 隐藏 [skip ci] 提交</label>
              <label><input type="checkbox" checked={includePrs} onChange={(e) => setIncludePrs(e.target.checked)} /> 包含合并的 PR（仅 GitHub）</label>
            </div>
          )}
          {tab === 2 && (
            <div className="form-grid">
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label><input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} style={{ width: "auto", minWidth: 0, marginRight: 6 }} /> 启用定时生成（Celery Beat）</label>
              </div>
              {scheduleEnabled && (
                <>
                  <div className="form-group">
                    <label>Cron 表达式</label>
                    <input value={scheduleCron} onChange={(e) => setScheduleCron(e.target.value)} placeholder="0 9 * * 1" />
                  </div>
                  <div className="form-group">
                    <label>时区</label>
                    <input value={scheduleTimezone} onChange={(e) => setScheduleTimezone(e.target.value)} placeholder="Asia/Shanghai" />
                  </div>
                </>
              )}
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>生成模式</label>
                <select value={llmGenerate ? "llm" : "template"} onChange={(e) => setLlmGenerate(e.target.value === "llm")}>
                  <option value="template">📋 模板生成（传统模式）</option>
                  <option value="llm">🤖 AI 智能生成（LLM 总结）</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label>自定义 Markdown 模板（留空使用内置；Jinja2 语法）</label>
                <textarea rows={6} value={customTemplate} onChange={(e) => setCustomTemplate(e.target.value)} placeholder="可选：覆盖内置模板" />
              </div>
            </div>
          )}
          {tab === 3 && (
            <div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                外部系统可通过以下 URL 触发本档案生成报告。请求需携带 HMAC 签名（若已配置）。
              </p>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <div style={{ flex: 1, background: "var(--bg)", padding: "0.7rem 0.9rem", borderRadius: "var(--radius-sm)", fontSize: "0.8rem", fontFamily: "monospace", wordBreak: "break-all", border: "1.5px solid var(--border)" }}>
                  <Globe size={14} style={{ verticalAlign: "-2px", marginRight: 6, color: "var(--text-muted)" }} />
                  {hookUrl}
                </div>
                <button type="button" className="btn btn-sm" onClick={copyHook}>
                  {copied ? <CheckCircle size={14} /> : <Copy size={14} />} {copied ? "已复制" : "复制"}
                </button>
              </div>
            </div>
          )}
          <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spin">⏳</span> : <Save size={16} />} 保存修改
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
