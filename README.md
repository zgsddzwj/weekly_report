# Weekly Report — 私有化 Git 周报生成器

从代码提交一键生成结构化 Markdown 周报。支持 **模板生成** 与 **AI 智能生成** 两种模式，全程私有化部署，Git PAT 加密存储，数据不出域。

**技术栈**：FastAPI + React 18 + Vite + TypeScript + PostgreSQL + Redis + Celery

---

## 功能特性

| 特性 | 说明 |
|------|------|
| 🔌 **Git 连接** | 支持 GitHub / GitLab（含私有化实例），PAT 加密落库 |
| 📁 **周报档案** | 多仓库聚合、自定义时间窗（1~90 天）、过滤规则、模板预设 |
| 🤖 **双模式生成** | 模板生成（Jinja2）或 AI 智能生成（LLM 总结），异常自动降级 |
| 🎨 **报告风格** | 内置 5 种风格（简洁/正式/技术/业务）+ 自定义描述，LLM 按风格输出 |
| 📡 **实时状态** | SSE 事件流推送生成进度，无需轮询 |
| ⏰ **定时生成** | Cron 表达式 + 时区配置，Celery Beat 调度 |
| 🔗 **Webhook 触发** | 外部 CI/CD 通过 URL 触发报告生成 |
| 🔽 **Markdown 下载** | 生成结果一键下载 `.md` 文件 |
| 🏢 **多组织** | 支持 `X-Organization-Id` 上下文切换 |
| 🔐 **OIDC 登录** | 企业单点登录（可选开启） |
| 💻 **CLI 客户端** | 命令行登录、查看档案、触发生成、拉取报告 |
| 🚀 **一键部署** | Docker Compose 本地启动 / Helm Chart 生产部署 |

---

## 两种生成模式

| | 模板生成 | AI 智能生成 |
|--|---------|------------|
| **原理** | Jinja2 模板按仓库/作者聚合提交，结构化输出 | LLM 阅读原始提交/PR，自主总结章节与亮点 |
| **优点** | 输出稳定、格式统一、零外部依赖 | 自动提炼业务价值、智能合并跨仓库关联 |
| **适用** | 追求格式一致性、无 LLM 环境 | 希望减少人工整理、已有内网 LLM 服务 |
| **降级** | — | LLM 异常时自动回退到模板生成 |

> AI 智能生成需要配置 `FEATURE_LLM=true` + `LLM_BASE_URL`，见下文「环境变量」。

---

## 快速启动（Docker Compose）

```bash
cp .env.example .env   # 可选：修改 ENCRYPTION_KEY / SECRET_KEY
docker compose up --build
```

- 前端：<http://localhost:8080>
- API 文档：<http://localhost:8000/docs>

首次使用流程：

1. **注册账号** → 打开前端首页，创建本地账号
2. **添加 Git 连接** → 进入「Git 连接」页，填入 GitHub/GitLab PAT
3. **新建档案** → 进入「周报档案」页，填写仓库列表（`owner/repo` 格式）、选择生成模式
4. **一键生成** → 在 Dashboard 点击「立即生成」，实时查看进度，完成后下载 Markdown

---

## 使用说明

### 1. Git 连接

- 支持 **GitHub**（`https://api.github.com`）和 **GitLab**（含私有化实例，如 `https://gitlab.company.com/api/v4`）
- 需要 PAT（Personal Access Token），权限至少包含 `repo`（GitHub）或 `read_api` + `read_repository`（GitLab）
- Token 通过 Fernet 加密后存储于 PostgreSQL

### 2. 周报档案

档案是生成周报的核心配置单元：

- **基本信息**：名称、Git 连接、仓库列表（多行或逗号分隔）、回溯天数、内置模板预设、报告风格
- **过滤规则**：忽略机器人提交、隐藏 merge 提交、隐藏 `[skip ci]` 提交、包含合并的 PR（仅 GitHub）
- **模板与定时**：
  - 生成模式：模板生成 / AI 智能生成（Dashboard 可一键切换）
  - 报告风格：中性（默认）、简洁明快、正式汇报、技术深度、业务价值、自定义
  - 自定义 Markdown 模板（Jinja2 语法，留空使用内置）
  - 定时生成：Cron 表达式 + 时区，Celery Beat 自动调度
- **Webhook**：每个档案拥有独立 Hook URL，外部系统 POST 即可触发报告生成

### 3. 生成与查看

- 触发方式：手动（Dashboard/档案页）、定时（Beat）、Webhook、CLI
- 状态流：SSE 实时推送 `pending → fetching → generating → success/failed`
- 结果：Markdown 正文支持在线预览与 `.md` 文件下载
- 历史：「报告历史」页查看所有生成记录与错误详情

### 4. CLI 客户端

```bash
# 登录配置
cd apps/api
uv run python -m app.cli login --url http://localhost:8000 --token <your-jwt>

# 查看当前用户
uv run python -m app.cli whoami

# 列出档案
uv run python -m app.cli profiles

# 触发生成并等待结果
uv run python -m app.cli reports generate --profile-id 1 --wait

# 查看报告历史
uv run python -m app.cli reports
```

---

## 环境变量

复制 `.env.example` 为 `.env` 按需调整：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ENCRYPTION_KEY` | Fernet 密钥，用于加密 Git PAT。**生产环境必须更换** | 示例密钥 |
| `SECRET_KEY` | FastAPI 签名密钥 | `change-me...` |
| `DATABASE_URL` | PostgreSQL 连接串 | Compose 内自动配置 |
| `REDIS_URL` | Redis 连接串 | Compose 内自动配置 |
| `CORS_ORIGINS` | 前端地址，逗号分隔 | `http://localhost:8080,...` |
| `FEATURE_LLM` | 开启 AI 智能生成模式 | `false` |
| `LLM_BASE_URL` | LLM OpenAI-compatible API 地址 | — |
| `LLM_API_KEY` | LLM API 密钥（内网无鉴权可留空） | — |
| `LLM_MODEL` | 模型名称 | `gpt-4o-mini` |
| `LLM_TIMEOUT_SECONDS` | LLM 请求超时（秒） | `120` |
| `S3_ENDPOINT_URL` | S3-compatible 对象存储地址（MinIO/AWS/OSS） | — |
| `S3_BUCKET` | 对象存储 Bucket | — |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | 对象存储密钥 | — |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | OIDC 单点登录配置 | — |
| `PUBLIC_APP_URL` | 前端公开地址（用于 OIDC 回调链接） | `http://localhost:8080` |
| `API_PUBLIC_URL` | API 公开地址（用于 OIDC redirect_uri） | `http://localhost:8000` |
| `ALLOW_PUBLIC_OAUTH` | 允许公开注册（本地账号） | `true` |
| `FEATURE_EXTERNAL_TELEMETRY` | 外部遥测（默认关闭） | `false` |

> 生成 Fernet 密钥：`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

---

## Kubernetes 部署（Helm）

```bash
cd deploy/helm/week-report
# 编辑 values.yaml 调整镜像、域名、资源等
helm install week-report . -n week-report --create-namespace
```

Chart 包含：API / Worker / Beat / Web / PostgreSQL / Redis / Secret / Ingress。

详见 `deploy/helm/week-report/values.yaml`。

---

## 本地开发

### 后端（`apps/api`）

依赖由 **[uv](https://docs.astral.sh/uv/)** 管理。

```bash
cd apps/api

# 同步依赖
uv sync

# 数据库迁移
uv run alembic upgrade head

# 启动 API
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 另开终端启动 Worker
uv run celery -A app.celery_app worker -l INFO

# 如需定时任务，再开终端启动 Beat
uv run celery -A app.celery_app beat -l INFO
```

### 前端（`apps/web`）

```bash
cd apps/web
npm install
npm run dev
```

Vite 已将 `/api` 代理到 `http://127.0.0.1:8000`，直接访问 <http://localhost:5173> 即可。

---

## 项目结构

```
apps/api/          # FastAPI + SQLAlchemy + Alembic + Celery
apps/web/          # Vite + React + TypeScript
deploy/helm/       # Helm Chart（K8s 部署）
docs/              # 架构说明 ARCHITECTURE.md
```

---

## 常见问题

**Q: Docker Compose 启动后 Worker 报错连接失败？**  
A: 确保 Docker Desktop 已运行；Worker/Beat 依赖 API 先完成数据库迁移（`depends_on: api`）。

**Q: AI 智能生成模式不可用？**  
A: 检查 `FEATURE_LLM=true` 且 `LLM_BASE_URL` 可达；若 LLM 服务异常，Worker 会自动降级到模板生成。

**Q: 为什么 AI 智能生成出来的还是表格？**  
A: 请确认档案的「生成模式」为 🤖 AI 智能生成，并检查 Worker 日志是否有 `report.llm_generate_success`；若 LLM 调用失败会自动降级到模板生成。

**Q: 前端构建报错？**  
A: 在 `apps/web` 目录执行 `npm install && npm run build`；确保 Node.js ≥ 18。

---

架构详细说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
