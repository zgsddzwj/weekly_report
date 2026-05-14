import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setOrgId, setToken, sseLines } from "../api";

type GitConnection = {
  id: number;
  provider: string;
  base_url: string;
  label: string;
  created_at: string;
};

type ReportProfile = {
  id: number;
  name: string;
  git_connection_id: number;
  repo_full_names: string;
  window_days: number;
  filters: Record<string, unknown>;
  style: Record<string, unknown>;
  created_at: string;
  schedule_cron: string | null;
  schedule_enabled: boolean;
  schedule_timezone: string;
  include_prs: boolean;
  hook_public_token: string;
};

type ReportRun = {
  id: number;
  profile_id: number;
  status: string;
  result_markdown: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
  trigger_source: string;
};

type TemplatePreset = {
  id: string;
  label_zh: string;
  label_en: string;
  description_zh: string;
};

type Organization = {
  id: number;
  name: string;
  slug: string;
  role: string;
};

export default function Dashboard() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [connections, setConnections] = useState<GitConnection[]>([]);
  const [profiles, setProfiles] = useState<ReportProfile[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);

  const [cProvider, setCProvider] = useState<"github" | "gitlab">("github");
  const [cBase, setCBase] = useState("https://api.github.com");
  const [cLabel, setCLabel] = useState("default");
  const [cToken, setCToken] = useState("");

  const [pName, setPName] = useState("我的周报");
  const [pConn, setPConn] = useState<number | "">("");
  const [pRepos, setPRepos] = useState("octocat/Hello-World");
  const [pDays, setPDays] = useState(7);
  const [pTemplatePreset, setPTemplatePreset] = useState("default");
  const [pIgnoreBots, setPIgnoreBots] = useState(true);
  const [pHideMerge, setPHideMerge] = useState(false);
  const [pHideSkipCi, setPHideSkipCi] = useState(false);
  const [pIncludePrs, setPIncludePrs] = useState(false);
  const [pScheduleEnabled, setPScheduleEnabled] = useState(false);
  const [pScheduleCron, setPScheduleCron] = useState("0 9 * * 1");
  const [pScheduleTimezone, setPScheduleTimezone] = useState("Asia/Shanghai");
  const [pCustomTemplate, setPCustomTemplate] = useState("");

  const [presets, setPresets] = useState<TemplatePreset[]>([]);
  const [eProfileId, setEProfileId] = useState<number | "">("");
  const [eName, setEName] = useState("");
  const [eConn, setEConn] = useState<number | "">("");
  const [eRepos, setERepos] = useState("");
  const [eDays, setEDays] = useState(7);
  const [eTemplatePreset, setETemplatePreset] = useState("default");
  const [eIgnoreBots, setEIgnoreBots] = useState(true);
  const [eHideMerge, setEHideMerge] = useState(false);
  const [eHideSkipCi, setEHideSkipCi] = useState(false);
  const [eIncludePrs, setEIncludePrs] = useState(false);
  const [eScheduleEnabled, setEScheduleEnabled] = useState(false);
  const [eScheduleCron, setEScheduleCron] = useState("0 9 * * 1");
  const [eScheduleTimezone, setEScheduleTimezone] = useState("Asia/Shanghai");
  const [eCustomTemplate, setECustomTemplate] = useState("");

  const [genProfileId, setGenProfileId] = useState<number | "">("");
  const [activeRun, setActiveRun] = useState<ReportRun | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<number | "">("");
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
      const [o, c, p, r, tp] = await Promise.all([
        api<Organization[]>("/organizations"),
        api<GitConnection[]>("/git-connections"),
        api<ReportProfile[]>("/report-profiles"),
        api<ReportRun[]>("/reports?limit=30"),
        api<TemplatePreset[]>("/report-profiles/template-presets"),
      ]);
      setOrgs(o);
      const savedOrg = localStorage.getItem("wr_org_id");
      const validOrg = o.find((x) => String(x.id) === savedOrg);
      const targetOrgId: number | undefined = validOrg ? validOrg.id : o[0]?.id;
      if (targetOrgId !== undefined) {
        setCurrentOrgId(targetOrgId);
        setOrgId(String(targetOrgId));
      }
      setConnections(c);
      setProfiles(p);
      setRuns(r);
      setPresets(tp);
      setPConn((prev) => (prev === "" && c.length ? c[0].id : prev));
      setGenProfileId((prev) => (prev === "" && p.length ? p[0].id : prev));
      setEProfileId((prev) => (prev === "" && p.length ? p[0].id : prev));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (cProvider === "github") setCBase("https://api.github.com");
    else setCBase("https://gitlab.com/api/v4");
  }, [cProvider]);

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
        /* fallback to polling if SSE fails */
        const t = window.setInterval(() => {
          api<ReportRun>(`/reports/${runId}`)
            .then((rr) => {
              setActiveRun(rr);
              if (rr.status === "success" || rr.status === "failed") {
                void refresh();
              }
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

  async function addConnection(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api<GitConnection>("/git-connections", {
        method: "POST",
        body: JSON.stringify({
          provider: cProvider,
          base_url: cBase,
          label: cLabel,
          token: cToken,
        }),
      });
      setCToken("");
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "创建连接失败");
    }
  }

  async function addProfile(e: FormEvent) {
    e.preventDefault();
    if (pConn === "") return;
    setErr(null);
    const style: Record<string, unknown> = { language: "zh", template_preset: pTemplatePreset };
    if (pCustomTemplate.trim()) {
      style.markdown_template = pCustomTemplate.trim();
    }
    try {
      await api<ReportProfile>("/report-profiles", {
        method: "POST",
        body: JSON.stringify({
          name: pName,
          git_connection_id: pConn,
          repo_full_names: pRepos,
          window_days: pDays,
          filters: {
            ignore_bots: pIgnoreBots,
            hide_merge_commits: pHideMerge,
            hide_skip_ci_commits: pHideSkipCi,
          },
          style,
          schedule_cron: pScheduleEnabled ? pScheduleCron : null,
          schedule_enabled: pScheduleEnabled,
          schedule_timezone: pScheduleTimezone,
          include_prs: pIncludePrs,
        }),
      });
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "创建档案失败");
    }
  }

  async function loadProfileForEdit() {
    if (eProfileId === "") return;
    setErr(null);
    try {
      const prof = await api<ReportProfile>(`/report-profiles/${eProfileId}`);
      setEName(prof.name);
      setEConn(prof.git_connection_id);
      setERepos(prof.repo_full_names);
      setEDays(prof.window_days);
      const f = prof.filters || {};
      setEIgnoreBots(f.ignore_bots !== false);
      setEHideMerge(Boolean(f.hide_merge_commits));
      setEHideSkipCi(Boolean(f.hide_skip_ci_commits));
      const st = prof.style || {};
      const pid = typeof st.template_preset === "string" ? st.template_preset : "default";
      setETemplatePreset(["default", "compact", "formal_zh"].includes(pid) ? pid : "default");
      setEIncludePrs(prof.include_prs);
      setEScheduleEnabled(prof.schedule_enabled);
      setEScheduleCron(prof.schedule_cron || "0 9 * * 1");
      setEScheduleTimezone(prof.schedule_timezone || "UTC");
      setECustomTemplate(typeof st.markdown_template === "string" ? st.markdown_template : "");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "加载档案失败");
    }
  }

  async function saveEditedProfile(e: FormEvent) {
    e.preventDefault();
    if (eProfileId === "" || eConn === "") return;
    setErr(null);
    const style: Record<string, unknown> = { template_preset: eTemplatePreset, language: "zh" };
    if (eCustomTemplate.trim()) {
      style.markdown_template = eCustomTemplate.trim();
    }
    try {
      await api<ReportProfile>(`/report-profiles/${eProfileId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: eName,
          git_connection_id: eConn,
          repo_full_names: eRepos,
          window_days: eDays,
          filters: {
            ignore_bots: eIgnoreBots,
            hide_merge_commits: eHideMerge,
            hide_skip_ci_commits: eHideSkipCi,
          },
          style,
          schedule_cron: eScheduleEnabled ? eScheduleCron : null,
          schedule_enabled: eScheduleEnabled,
          schedule_timezone: eScheduleTimezone,
          include_prs: eIncludePrs,
        }),
      });
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "更新档案失败");
    }
  }

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
      await refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "生成失败");
    }
  }

  function logout() {
    setToken(null);
    nav("/login");
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

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "1.25rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <h1 style={{ margin: 0 }}>Week Report</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {orgs.length > 1 ? (
            <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.9rem" }}>
              组织
              <select
                value={currentOrgId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setCurrentOrgId(id);
                  setOrgId(String(id));
                  void refresh();
                }}
                style={{ fontSize: "0.9rem" }}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.role})
                  </option>
                ))}
              </select>
            </label>
          ) : orgs.length === 1 ? (
            <span style={{ fontSize: "0.9rem", color: "#64748b" }}>{orgs[0].name}</span>
          ) : null}
          <button type="button" className="secondary" onClick={logout}>
            退出
          </button>
        </div>
      </header>
      {err ? <p className="err">{err}</p> : null}

      {showGuide ? (
        <section className="card" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>📖 新手指南</h2>
            <button
              type="button"
              className="secondary"
              style={{ fontSize: "0.8rem", padding: "0.25rem 0.6rem" }}
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
              <strong>添加 Git 连接</strong>：在下方「新建 Git 连接」填入你的平台（GitHub/GitLab/Gitee）和
              <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                Personal Access Token
              </a>
              （需读取仓库权限）。GitHub 用户建议使用 Fine-grained PAT。
            </li>
            <li>
              <strong>创建周报档案</strong>：在「新建周报档案」选择刚添加的连接，填写仓库列表（格式
              <code>owner/repo</code>，多个用逗号或换行分隔），选择模板与过滤规则。
            </li>
            <li>
              <strong>一键生成周报</strong>：在「生成周报」选择档案，点击「一键生成」。Worker 会自动拉取时间窗内的提交并渲染为 Markdown。
            </li>
            <li>
              <strong>查看与扩展</strong>：结果支持实时预览、下载 .md。进阶功能包括定时任务（Celery Beat）、Webhook 外部触发、PR 数据汇总、自定义 Jinja2 模板等。
            </li>
          </ol>
        </section>
      ) : (
        <div style={{ textAlign: "right", marginBottom: "0.5rem" }}>
          <button
            type="button"
            className="secondary"
            style={{ fontSize: "0.8rem", padding: "0.25rem 0.6rem" }}
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

      <section className="card">
        <h2>新建 Git 连接</h2>
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
          GitHub 使用 Fine-grained 或 classic PAT；GitLab 使用 Personal Access Token（需读仓库权限）。
        </p>
        <form onSubmit={addConnection} className="row">
          <label>
            平台
            <select value={cProvider} onChange={(e) => setCProvider(e.target.value as "github" | "gitlab")}>
              <option value="github">github</option>
              <option value="gitlab">gitlab</option>
            </select>
          </label>
          <label style={{ flex: 1, minWidth: "16rem" }}>
            API Base URL
            <input value={cBase} onChange={(e) => setCBase(e.target.value)} required />
          </label>
          <label>
            显示名
            <input value={cLabel} onChange={(e) => setCLabel(e.target.value)} required />
          </label>
          <label style={{ flex: 1, minWidth: "16rem" }}>
            Token
            <input value={cToken} onChange={(e) => setCToken(e.target.value)} type="password" required />
          </label>
          <button type="submit">保存连接</button>
        </form>
      </section>

      <section className="card">
        <h2>新建周报档案</h2>
        <form onSubmit={addProfile} className="row">
          <label>
            名称
            <input value={pName} onChange={(e) => setPName(e.target.value)} required />
          </label>
          <label>
            使用连接
            <select value={pConn} onChange={(e) => setPConn(Number(e.target.value))}>
              {connections.length === 0 ? <option value="">请先添加连接</option> : null}
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} {c.label} ({c.provider})
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, minWidth: "18rem" }}>
            仓库列表（每行或逗号分隔，格式 owner/repo）
            <textarea rows={4} value={pRepos} onChange={(e) => setPRepos(e.target.value)} required />
          </label>
          <label>
            回溯天数
            <input
              type="number"
              min={1}
              max={90}
              value={pDays}
              onChange={(e) => setPDays(Number(e.target.value))}
            />
          </label>
          <label>
            内置模板
            <select value={pTemplatePreset} onChange={(e) => setPTemplatePreset(e.target.value)}>
              {presets.length === 0 ? <option value="default">default</option> : null}
              {presets.map((tp) => (
                <option key={tp.id} value={tp.id} title={tp.description_zh}>
                  {tp.label_zh}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="checkbox" checked={pIgnoreBots} onChange={(e) => setPIgnoreBots(e.target.checked)} />
              忽略机器人提交
            </label>
            <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="checkbox" checked={pHideMerge} onChange={(e) => setPHideMerge(e.target.checked)} />
              隐藏 merge 提交
            </label>
            <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="checkbox" checked={pHideSkipCi} onChange={(e) => setPHideSkipCi(e.target.checked)} />
              隐藏含 [skip ci] / [ci skip] 的提交
            </label>
            <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="checkbox" checked={pIncludePrs} onChange={(e) => setPIncludePrs(e.target.checked)} />
              包含合并的 PR（仅 GitHub）
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "0.5rem" }}>
            <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="checkbox" checked={pScheduleEnabled} onChange={(e) => setPScheduleEnabled(e.target.checked)} />
              启用定时生成（Celery Beat）
            </label>
            {pScheduleEnabled ? (
              <>
                <label>
                  Cron 表达式
                  <input value={pScheduleCron} onChange={(e) => setPScheduleCron(e.target.value)} placeholder="0 9 * * 1" style={{ width: "10rem" }} />
                </label>
                <label>
                  时区
                  <input value={pScheduleTimezone} onChange={(e) => setPScheduleTimezone(e.target.value)} placeholder="Asia/Shanghai" style={{ width: "10rem" }} />
                </label>
              </>
            ) : null}
          </div>
          <label style={{ flex: 1, minWidth: "18rem" }}>
            自定义 Markdown 模板（留空使用内置模板；Jinja2 语法）
            <textarea rows={4} value={pCustomTemplate} onChange={(e) => setPCustomTemplate(e.target.value)} placeholder="可选：覆盖内置模板" />
          </label>
          <button type="submit" disabled={!connections.length}>
            保存档案
          </button>
        </form>
      </section>

      <section className="card">
        <h2>编辑周报档案</h2>
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
          选择档案后点「加载到表单」，修改后「保存修改」会调用 PATCH（与架构文档 §7 对齐）。
        </p>
        <form onSubmit={saveEditedProfile} className="row">
          <label>
            要编辑的档案
            <select
              value={eProfileId === "" ? "" : String(eProfileId)}
              onChange={(e) => {
                const v = e.target.value;
                setEProfileId(v === "" ? "" : Number(v));
              }}
            >
              {profiles.length === 0 ? <option value="">请先创建档案</option> : null}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary" disabled={eProfileId === ""} onClick={() => void loadProfileForEdit()}>
            加载到表单
          </button>
          <label>
            名称
            <input value={eName} onChange={(e) => setEName(e.target.value)} required />
          </label>
          <label>
            使用连接
            <select value={eConn} onChange={(e) => setEConn(Number(e.target.value))}>
              {connections.length === 0 ? <option value="">请先添加连接</option> : null}
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} {c.label} ({c.provider})
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, minWidth: "18rem" }}>
            仓库列表
            <textarea rows={4} value={eRepos} onChange={(e) => setERepos(e.target.value)} required />
          </label>
          <label>
            回溯天数
            <input
              type="number"
              min={1}
              max={90}
              value={eDays}
              onChange={(e) => setEDays(Number(e.target.value))}
            />
          </label>
          <label>
            内置模板
            <select value={eTemplatePreset} onChange={(e) => setETemplatePreset(e.target.value)}>
              {presets.length === 0 ? <option value="default">default</option> : null}
              {presets.map((tp) => (
                <option key={tp.id} value={tp.id} title={tp.description_zh}>
                  {tp.label_zh}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="checkbox" checked={eIgnoreBots} onChange={(e) => setEIgnoreBots(e.target.checked)} />
              忽略机器人提交
            </label>
            <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="checkbox" checked={eHideMerge} onChange={(e) => setEHideMerge(e.target.checked)} />
              隐藏 merge 提交
            </label>
            <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="checkbox" checked={eHideSkipCi} onChange={(e) => setEHideSkipCi(e.target.checked)} />
              隐藏含 [skip ci] / [ci skip] 的提交
            </label>
            <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="checkbox" checked={eIncludePrs} onChange={(e) => setEIncludePrs(e.target.checked)} />
              包含合并的 PR（仅 GitHub）
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "0.5rem" }}>
            <label style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input type="checkbox" checked={eScheduleEnabled} onChange={(e) => setEScheduleEnabled(e.target.checked)} />
              启用定时生成（Celery Beat）
            </label>
            {eScheduleEnabled ? (
              <>
                <label>
                  Cron 表达式
                  <input value={eScheduleCron} onChange={(e) => setEScheduleCron(e.target.value)} placeholder="0 9 * * 1" style={{ width: "10rem" }} />
                </label>
                <label>
                  时区
                  <input value={eScheduleTimezone} onChange={(e) => setEScheduleTimezone(e.target.value)} placeholder="Asia/Shanghai" style={{ width: "10rem" }} />
                </label>
              </>
            ) : null}
          </div>
          <label style={{ flex: 1, minWidth: "18rem" }}>
            自定义 Markdown 模板（留空使用内置模板；Jinja2 语法）
            <textarea rows={4} value={eCustomTemplate} onChange={(e) => setECustomTemplate(e.target.value)} placeholder="可选：覆盖内置模板" />
          </label>
          <button type="submit" disabled={eProfileId === "" || !connections.length}>
            保存修改
          </button>
        </form>
        {eProfileId !== "" ? (
          <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e2e8f0", fontSize: "0.85rem", color: "#64748b" }}>
            <div>Webhook 地址（外部触发）:</div>
            <code style={{ wordBreak: "break-all" }}>
              {`${window.location.origin}/api/v1/public/hooks/report-profiles/${profiles.find((p) => p.id === eProfileId)?.hook_public_token || "…"}/runs`}
            </code>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>生成周报</h2>
        <form onSubmit={generate} className="row">
          <label>
            档案
            <select
              value={genProfileId}
              onChange={(e) => setGenProfileId(Number(e.target.value))}
              disabled={!profiles.length}
            >
              {profiles.length === 0 ? <option value="">请先创建档案</option> : null}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} {p.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!profiles.length}>
            一键生成
          </button>
        </form>
        {activeRun ? (
          <div style={{ marginTop: "1rem" }}>
            <p>
              任务 #{activeRun.id} 状态：<strong>{activeRun.status}</strong>
            </p>
            {activeRun.error_message ? <p className="err">{activeRun.error_message}</p> : null}
            {activeRun.result_markdown ? (
              <>
                <div style={{ marginBottom: "0.5rem" }}>
                  <button type="button" className="secondary" onClick={() => downloadMarkdown(activeRun.result_markdown!, `report-${activeRun.id}.md`)}>
                    下载 .md
                  </button>
                </div>
                <pre className="md">{activeRun.result_markdown}</pre>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>最近运行</h2>
        <button type="button" className="secondary" onClick={() => refresh().catch(() => {})}>
          刷新列表
        </button>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.75rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "0.35rem" }}>ID</th>
              <th>档案</th>
              <th>状态</th>
              <th>触发方式</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "0.35rem" }}>{r.id}</td>
                <td>{r.profile_id}</td>
                <td>{r.status}</td>
                <td>{r.trigger_source}</td>
                <td>{r.created_at}</td>
                <td>
                  {r.status === "success" && r.result_markdown ? (
                    <button type="button" className="secondary" style={{ fontSize: "0.8rem", padding: "0.2rem 0.5rem" }} onClick={() => downloadMarkdown(r.result_markdown!, `report-${r.id}.md`)}>
                      下载
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
