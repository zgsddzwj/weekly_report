# Week Report — 项目架构说明

本文档汇总「一键生成周报」产品的架构思路与技术选型，作为私有化部署与后续迭代的基准。实现代码可与文档渐进对齐；以文档约束方向，以代码验证细节。

---

## 1. 目标与边界

### 1.1 产品目标

- 聚合用户在**多个代码仓库**、指定**时间窗**内的 Git 事实（提交为主，可扩展 PR / Issue / CI）。
- 按用户配置的**叙事模板与风格**输出周报（Markdown 为基线，再扩展推送渠道）。
- **一键生成**：手动触发为主，后续支持定时任务与 Webhook。

### 1.2 硬性约束（已定）

| 约束 | 选择 |
|------|------|
| 部署形态 | **必须支持私有化部署**（内网、离线镜像、自建 GitLab 等） |
| 后端 | **Python** |
| 前端 | **React** |
| 数据主权 | 默认不落盘完整 diff；敏感配置加密存储 |

### 1.3 非目标（首期可不做）

- 替代码审查或项目管理工具做「真相源」。
- 强依赖某一公有云 LLM（若做 AI 润色，须可选、可关、可指向内网推理）。

### 1.4 产品原则（与迭代优先级一致）

- **事实优先**：结论可回溯到具体提交 / PR 链接，避免「无法核对」的泛泛描述。
- **私有化默认安全**：Token 加密、可选不落 diff、外发遥测默认关闭。
- **模板与规则可演进**：先 UI + JSON 配置，再考虑「规则进 Git」与 UI 双向同步（见 §10）。

---

## 2. 总体架构

### 2.1 逻辑分层

```
┌─────────────────────────────────────────────────────────────┐
│  Web（React）  配置向导 / 档案管理 / 触发生成 / 结果预览      │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS / JSON
┌───────────────────────────▼─────────────────────────────────┐
│  API（FastAPI）  认证、档案 CRUD、创建生成任务、查询状态       │
└───────────┬─────────────────────────────┬───────────────────┘
            │                             │
            ▼                             ▼
┌───────────────────┐           ┌─────────────────────┐
│  PostgreSQL        │           │  Redis               │
│  用户/配置/报告元数据 │           │  Celery broker/backend │
└───────────────────┘           └──────────┬──────────┘
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │  Worker（Celery）    │
                                │  拉 Git API → 规范化  │
                                │  → 模板渲染 → 写结果  │
                                └─────────────────────┘
```

### 2.2 进程与交付

- **API 服务**：HTTP + OpenAPI；启动前执行 DB 迁移（Alembic）。
- **Worker**：与 API **同代码库、不同进程**；负责耗时 IO（Git API、可选 LLM）。
- **可选 Beat**：定时周报（Cron 表达式 → 队列任务）。
- **前端**：构建为静态资源；由 **Nginx（或网关）** 反代 `/api` 到后端，单入口域名，简化 CORS 与 Cookie 策略。

### 2.3 推荐仓库布局（目标）

```
apps/api/          # FastAPI + SQLAlchemy + Alembic + Celery；pyproject.toml / uv.lock（uv）
apps/web/          # Vite + React + TypeScript
deploy/            # docker-compose、Helm、nginx 模板（按需要增长）
docs/              # 架构与设计文档（本文件）
```

---

## 3. 技术选型（已定方向）

### 3.1 后端（Python）

| 能力 | 建议选型 | 说明 |
|------|-----------|------|
| Web 框架 | **FastAPI** | OpenAPI 原生、类型与异步友好 |
| ORM / 迁移 | **SQLAlchemy 2 + Alembic** | 私有化升级可重复 |
| 数据库 | **PostgreSQL** | 用户、租户、配置版本、报告运行记录 |
| 任务队列 | **Celery + Redis** | 与私有化常见中间件一致 |
| HTTP 客户端 | **httpx** | 调用 GitHub / GitLab API |
| 配置 | **Pydantic Settings** + 环境变量 | 12-factor，容器/K8s 友好 |
| 密码 | **passlib[bcrypt]** | 若启用本地账号 |
| Token 加密 | **cryptography (Fernet)** | Git PAT 等字段加密落库 |
| 模板 | **Jinja2** | 周报正文与「可配置 Markdown 模板」 |
| 依赖与环境 | **uv**（`pyproject.toml` + `uv.lock`） | 本地与镜像内统一解析、可完整复现构建 |

### 3.2 前端（React）

| 能力 | 建议选型 | 说明 |
|------|-----------|------|
| 构建 | **Vite + TypeScript** | 静态产物易托管 |
| 数据获取 | **TanStack Query** | 缓存、轮询报告状态 |
| UI | **MUI 或 Ant Design** | 企业后台成熟度二选一即可 |
| API 类型 | OpenAPI 生成 client（可选） | 与 FastAPI 契约一致 |

### 3.3 私有化部署

| 能力 | 建议 |
|------|------|
| 一键起 | **Docker Compose**（开发与小规模生产） |
| 规模化 | **Helm Chart / K8s**（企业内网） |
| 对象存储 | **MinIO** 或 PVC（报告附件、缓存 JSON） |
| 身份 | 首期 **邮箱+密码 + JWT**；企业版 **OIDC/SAML** 对接 IdP |
| 密钥 | **环境变量 / K8s Secret**；`ENCRYPTION_KEY`、`SECRET_KEY` 不入镜像 |
| 出口网络 | 支持 **`HTTP(S)_PROXY`**，便于内网 Git 经统一代理访问公网或跨区 |
| 离线交付 | 镜像 **tar 导入私有 Registry**；文档中注明依赖版本与 SBOM（与运维清单一致） |

### 3.4 功能开关（建议以环境变量控制）

便于私有化策略「默认关、按需开」：

| 开关（示例名） | 含义 |
|----------------|------|
| `FEATURE_LLM` | 是否允许调用 LLM；关闭时仅模板 + 事实表 |
| `LLM_BASE_URL` / 模型名 | 指向内网网关、vLLM、Ollama 等 |
| `FEATURE_EXTERNAL_TELEMETRY` | 外发使用统计；私有化默认 `false` |
| `ALLOW_PUBLIC_OAUTH` | 是否展示公网 OAuth；纯内网可仅保留 PAT / 自建 IdP |

---

## 4. 核心领域模型（概念）

以下为逻辑实体，表名与字段可在实现期微调。

- **User**：登录主体；与 Git 授权分离。
- **GitConnection**：绑定一种托管（`github` / `gitlab`）、`base_url`（支持自建 GitLab）、展示用 `label`、**加密存储**的访问令牌。
- **ReportProfile**：用户命名的「周报方案」：关联 `GitConnection`、仓库列表（`owner/repo` 或 GitLab `group/project`）、`window_days`、`filters`（JSON）、`style`（JSON，含模板覆盖字段）。
- **ReportRun**：一次生成任务：`pending` → `running` → `success` | `failed`；存 `result_markdown`、`error_message`、`celery_task_id`、时间戳。

**配置版本化（建议后续迭代）**：每次生成快照 `profile` 的版本号或 hash，便于复现与审计。

---

## 5. 周报生成流水线

1. **创建 ReportRun**（API）：校验 `profile` 归属，写入 `pending`，投递 Celery。
2. **Worker**：
   - 解密 Git Token；
   - 按 `provider` + `base_url` 调用对应 API，在 `window_days` 内拉取 commits（分页、限流）；
   - **规范化**为内部事件列表（仓库、SHA、message、作者、时间、链接）；
   - 应用 `filters`（如忽略 bot、merge 策略等）；
   - **Jinja2** 渲染：`style` 中可含自定义 `markdown_template` 覆盖默认表格式周报；
   - 写回 `ReportRun` 并标记完成时间。
3. **前端**：对 `running` 状态轮询或 SSE（后续可加）。

**GitHub / GitLab 差异**：通过 `provider` 与 `base_url` 分支；自建实例只改配置，不改部署包。

---

## 6. 可自定义维度（产品能力地图）

便于按优先级拆需求；与 `ReportProfile.filters` / `style` 及后续「规则引擎」对齐。

### 6.1 与代码事实相关

- 数据源范围：commits / PR / Issue / Release / CI 结果（分期）；托管除 GitHub、GitLab 外可评估 **Gitee** 等与 API 模型相近的接入。
- 聚合维度：按仓库、按作者、按目录或 **Conventional Commits** 的 `scope`（分期）。
- **提交展示风格**：是否强调首行 subject、是否展开 body、是否关联 Issue 关键字（与 `style` / 模板变量对齐）。
- **贡献归因**：Co-author、Squash 后作者展示、Revert 是否单独成节（分期）。
- 过滤：bot、merge commit 展示策略、`[skip ci]`、最小改动阈值（注意 GitHub list commits 与 stats 能力差异）。

### 6.2 与叙事与模板相关

- 语言（中/英）、语气（正式 / 简报）、**篇幅**（短 / 标准 / 详）、章节顺序（完成项 / 风险 / 下周计划等）。
- **内置模板**多套可选 + **自定义 Markdown 模板**（Jinja）：标题、表头、脚注、是否附统计附录。
- 可选 **LLM 润色**：必须可关闭；**禁止编造**未出现在事件流中的工单号；固定 system 提示 + **输出结构校验**（如 JSON schema 再渲染）；建议 **独立 LLM worker** 与超时/配额，避免阻塞主 Worker。

### 6.3 与集成相关

- 导出：剪贴板、下载 `.md`、推送飞书 / Slack / 邮件 / Notion 等（分期，以 Adapter 扩展）。
- 触发：**手动**、**Celery Beat 定时**、**Webhook**（如迭代结束）、**CLI**、**GitHub Action** 调用 HTTP API（分期）。

### 6.4 与多租户与合规相关

- 团队 / 组织、RBAC（分期）。
- 审计日志：谁在何时用哪份配置生成了报告（分期）。
- **数据驻留与深度分析**：默认仅元数据；若开启「拉取 / 分析 diff」，需单独同意与保留期限策略。
- **敏感信息**：可选脱敏规则（内部域名、token 片段、客户名白/黑名单等，分期）。
- 数据保留天数与缓存 TTL（运维策略）。

### 6.5 与项目管理联动（扩展插件）

- **Jira / Linear** 等：将本周 Done / 进行中与 Git 活动交叉引用（独立集成模块，避免核心域耦合）。

---

## 7. API 形态（建议）

- `POST /auth/register`、`POST /auth/login`、`GET /auth/me`
- `GET/POST/DELETE /git-connections`
- `GET/POST/PATCH/DELETE /report-profiles`
- `POST /reports` → 返回 `report_id`，状态 `202` 或 `200`+任务 id
- `GET /reports/{id}` → 状态与 `result_markdown`
- `GET /health`、`GET /openapi.json`

对外统一前缀 `/api/v1`（由网关或 FastAPI `root_path` 拼接）。

---

## 8. 安全与运维清单

- Git Token：**仅密文入库**；日志脱敏；最小 OAuth scope / PAT 权限说明写进运维文档。
- **CORS**：按部署域名配置 `ALLOWED_ORIGINS`。
- **HTTPS**：生产由入口网关终止 TLS。
- **依赖与镜像**：CI 中漏洞扫描；镜像非 root、多阶段构建。
- **可观测性**：结构化日志、可选 OpenTelemetry；指标包括 Git API 429 率、任务成功率、队列积压。

---

## 9. 迭代路线（建议）

与最初讨论的分期一致，并略作合并；实施时可按团队速度拆 sprint。

| 阶段 | 内容 |
|------|------|
| **MVP** | 注册登录、Git 连接（PAT/OAuth 路线可二选一或并存）、**多仓库**、时间窗、GitHub/GitLab **commits**、**2～3 套内置模板** + 基础自定义、Markdown 结果、**Docker Compose 一键起** |
| **V1** | **Celery Beat** 定时周报、**配置版本快照**、基础**审计**、Nginx **单域反代** `/api`、报告缓存 / 可选 MinIO |
| **V2** | **OIDC/SAML**、**组织与 RBAC**、多渠道推送、**可选 LLM（内网）**、**Helm**、CLI、与 Jira/Linear **插件化**对接 |
| **V3+（可选）** | 统计视图（提交热力、**Review 响应时间** 等）、计费（若做 SaaS 形态）、更细规则引擎与「规则进 Git」 |

**差异化（对外话术，可与商业材料同步）**：事实可点回源、配置可审计、私有化数据路径可控。

---

## 10. 待决与优化点（刻意留白）

- 是否引入「规则 YAML 进 Git」与 UI 双向同步。
- 报告大字段是否外迁对象存储以减轻 PG。
- GitHub App vs PAT 在企业场景的默认推荐与文档话术。
- 多 Worker 时 `ENCRYPTION_KEY` 必须固定且由 KMS/Secret 管理（禁止每实例随机）。

---

## 11. 文档维护约定

- 架构变更（新服务、新存储、认证方式变化）应先更新本文件，再改代码或并行进行。
- 与外部系统（GitLab 版本、API 差异）相关的约束，在 `docs/` 下可增加专题页并在此文「相关文档」处链接。

---

*文档版本：与仓库内首次整理同步；后续提交请在 PR 中说明对本节的增删。*
