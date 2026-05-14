"""Built-in Markdown templates (architecture §9 MVP: multiple presets + custom Jinja)."""

from typing import Any

COMPACT_TEMPLATE = """# {{ title }}

**{{ window_start }} ~ {{ window_end }}** · {{ repo_list }}

## 提交列表

{% if commits %}
{% for c in commits -%}
- `{{ c.repo }}` [{{ c.sha }}]({{ c.url }}) — {{ c.message | e }}（{{ c.author | e }} · {{ c.date }}）
{% endfor %}
{% else %}
所选时间窗内无匹配提交。
{% endif %}

{{ footer }}
"""

FORMAL_ZH_TEMPLATE = """# {{ title }}

**统计周期**：{{ window_start }} 至 {{ window_end }}  
**涉及仓库**：{{ repo_list }}

## 一、提交汇总

{% if commits %}
| 仓库 | 提交 | 摘要 | 作者 | 时间 |
|------|------|------|------|------|
{% for c in commits -%}
| `{{ c.repo }}` | [{{ c.sha }}]({{ c.url }}) | {{ c.message | e }} | {{ c.author | e }} | {{ c.date }} |
{% endfor %}
{% else %}
本期时间窗内未检索到符合条件的提交（请核对 Token 权限与仓库名 `owner/repo` 格式）。
{% endif %}

## 二、说明与核对

{{ footer }}
"""

DEFAULT_TABLE_TEMPLATE = """# {{ title }}

**周期**: {{ window_start }} ~ {{ window_end }}  
**仓库**: {{ repo_list }}

## 提交概览

{% if commits %}
| 仓库 | 提交 | 说明 | 作者 | 时间 |
|------|------|------|------|------|
{% for c in commits -%}
| `{{ c.repo }}` | [{{ c.sha }}]({{ c.url }}) | {{ c.message | e }} | {{ c.author | e }} | {{ c.date }} |
{% endfor %}
{% else %}
本周所选时间窗内无匹配提交（或 Token 权限不足 / 仓库名格式应为 `owner/repo`）。
{% endif %}

## 备注

{{ footer }}
"""

BUILTIN_TEMPLATE_BY_PRESET: dict[str, str] = {
    "default": DEFAULT_TABLE_TEMPLATE,
    "compact": COMPACT_TEMPLATE,
    "formal_zh": FORMAL_ZH_TEMPLATE,
}

TEMPLATE_PRESET_CATALOG: list[dict[str, str]] = [
    {
        "id": "default",
        "label_zh": "标准表格",
        "label_en": "Standard table",
        "description_zh": "仓库、提交、说明、作者、时间表格，适合邮件与文档粘贴。",
    },
    {
        "id": "compact",
        "label_zh": "紧凑列表",
        "label_en": "Compact list",
        "description_zh": "Markdown 列表，适合 IM / 评论区快速浏览。",
    },
    {
        "id": "formal_zh",
        "label_zh": "正式分节（中文）",
        "label_en": "Formal sections (ZH)",
        "description_zh": "分节标题与表格样式，偏对内汇报语气。",
    },
]


def normalize_template_preset(style: dict[str, Any]) -> str:
    raw = style.get("template_preset") or "default"
    if not isinstance(raw, str):
        return "default"
    return raw if raw in BUILTIN_TEMPLATE_BY_PRESET else "default"


def resolve_markdown_template_string(style: dict[str, Any]) -> str:
    """Custom Jinja body wins; then named preset; else default table."""
    custom = style.get("markdown_template")
    if isinstance(custom, str) and custom.strip():
        return custom
    preset = normalize_template_preset(style)
    return BUILTIN_TEMPLATE_BY_PRESET[preset]
