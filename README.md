# Week Report

私有化「从 Git 提交生成 Markdown 周报」的最小可运行骨架：FastAPI + Celery + PostgreSQL + Redis + React（Nginx 反代 `/api`）。后端依赖由 **[uv](https://docs.astral.sh/uv/)** 管理（`apps/api/pyproject.toml` + `uv.lock`）。

## 快速启动（Docker）

```bash
cp .env.example .env   # 可选：修改 ENCRYPTION_KEY / SECRET_KEY
docker compose up --build
```

- 前端：<http://localhost:8080>
- API 直连：<http://localhost:8000/docs>

首次使用：在页面注册账号 → 添加 Git 连接（PAT）→ 新建档案（仓库列表 `owner/repo`）→ 一键生成；Worker 拉取提交并写入 Markdown。

## 本地开发（不设 Docker）

### 准备 uv

若尚未安装 uv，见官方说明：[Installing uv](https://docs.astral.sh/uv/getting-started/installation/)。

### 后端（`apps/api`）

1. 启动 PostgreSQL、Redis，在 shell 中导出与 `app.config.Settings` 一致的环境变量：`DATABASE_URL`、`REDIS_URL`、`ENCRYPTION_KEY`（Fernet）、`SECRET_KEY`、`CORS_ORIGINS` 等。
2. 同步依赖并迁移、启动 API：

```bash
cd apps/api
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

另开终端启动 Worker：

```bash
cd apps/api
uv run celery -A app.celery_app worker -l INFO
```

依赖版本变更后执行 `uv lock`（本仓库目标 Python 见 `apps/api/.python-version`，与 Docker 中 3.12 对齐可用 `uv lock --python 3.12`），提交更新后的 `uv.lock`。

### 前端（`apps/web`）

```bash
cd apps/web && npm install && npm run dev
```

Vite 已将 `/api` 代理到 `http://127.0.0.1:8000`。

---

若 `docker compose build` 报 Docker daemon 未启动，请先打开 Docker Desktop。若 Cursor 里长时间 `pip`/`uv` 任务像「卡住」，多为沙箱超时或网络慢，在本地终端执行相同命令即可。

架构说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
