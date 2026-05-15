import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, Plus, Trash2, Edit3, ChevronRight, CheckCircle } from "lucide-react";
import { api } from "../api";
import { useToast } from "../components/Toast";
import type { GitConnection, ReportProfile, TemplatePreset } from "../types";

export default function ProfilesPage() {
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [connections, setConnections] = useState<GitConnection[]>([]);
  const [profiles, setProfiles] = useState<ReportProfile[]>([]);
  const [presets, setPresets] = useState<TemplatePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(0);

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
  const [llmGenerate, setLlmGenerate] = useState(false);

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
    } finally {
      setLoading(false);
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
      setRepos("");
      setStep(0);
      setShowForm(false);
      toast.showSuccess("档案创建成功");
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
      toast.showSuccess("档案已删除");
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "删除失败");
    }
  }

  const steps = ["基本信息", "过滤规则", "模板与定时"];

  return (
    <div>
      <div className="page-header">
        <h1>📁 周报档案</h1>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> {showForm ? "取消" : "新建档案"}
        </button>
      </div>

      {err ? <div className="alert alert-error"><span>{err}</span></div> : null}

      {showForm && (
        <section className="card">
          <div className="card-header"><h2>新建档案向导</h2></div>
          {connections.length === 0 ? (
            <div className="empty-state">
              <FolderOpen size={40} />
              <h3>还没有 Git 连接</h3>
              <p>先去 <Link to="/connections" className="link-btn">添加连接</Link></p>
            </div>
          ) : (
            <>
              <div className="stepper">
                {steps.map((s, i) => (
                  <div key={i} className={`step ${i === step ? "active" : i < step ? "done" : ""}`}>
                    <span className="step-num">{i < step ? <CheckCircle size={12} /> : i + 1}</span>
                    {s}
                  </div>
                ))}
              </div>
              <form onSubmit={addProfile}>
                {step === 0 && (
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
                      <label>仓库列表（每行或逗号分隔，格式 owner/repo）</label>
                      <textarea rows={3} value={repos} onChange={(e) => setRepos(e.target.value)} required placeholder="torvalds/linux\nfacebook/react" />
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
                {step === 1 && (
                  <div>
                    <div className="checkbox-row">
                      <label><input type="checkbox" checked={ignoreBots} onChange={(e) => setIgnoreBots(e.target.checked)} /> 忽略机器人提交</label>
                      <label><input type="checkbox" checked={hideMerge} onChange={(e) => setHideMerge(e.target.checked)} /> 隐藏 merge 提交</label>
                      <label><input type="checkbox" checked={hideSkipCi} onChange={(e) => setHideSkipCi(e.target.checked)} /> 隐藏 [skip ci] 提交</label>
                      <label><input type="checkbox" checked={includePrs} onChange={(e) => setIncludePrs(e.target.checked)} /> 包含合并的 PR（仅 GitHub）</label>
                    </div>
                  </div>
                )}
                {step === 2 && (
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
                        <option value="template">模板生成（传统模式）</option>
                        <option value="llm">AI 智能生成（LLM 总结）</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                      <label>自定义 Markdown 模板（留空使用内置；Jinja2 语法）</label>
                      <textarea rows={4} value={customTemplate} onChange={(e) => setCustomTemplate(e.target.value)} placeholder="可选：覆盖内置模板" />
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
                  {step > 0 && <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>上一步</button>}
                  {step < steps.length - 1 ? (
                    <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>下一步 <ChevronRight size={14} /></button>
                  ) : (
                    <button type="submit" className="btn btn-primary"><Plus size={16} /> 保存档案</button>
                  )}
                </div>
              </form>
            </>
          )}
        </section>
      )}

      <section className="card">
        <div className="card-header"><h2>现有档案</h2></div>
        {loading ? (
          <div style={{ height: 120, background: "var(--border)", borderRadius: 6 }} />
        ) : profiles.length === 0 ? (
          <div className="empty-state">
            <FolderOpen size={40} />
            <h3>暂无档案</h3>
            <p>点击右上角「新建档案」创建你的第一个周报方案</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>名称</th><th>仓库</th><th>时间窗</th><th>定时</th><th>操作</th></tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>#{p.id} {p.name}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "18rem", overflow: "hidden", textOverflow: "ellipsis" }}>{p.repo_full_names}</td>
                  <td>{p.window_days} 天</td>
                  <td>{p.schedule_enabled ? <span className="badge badge-success">已启用</span> : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <Link to={`/profiles/${p.id}/edit`}>
                        <button className="btn btn-sm btn-icon" title="编辑"><Edit3 size={14} /></button>
                      </Link>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(p.id)} title="删除"><Trash2 size={14} /></button>
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
