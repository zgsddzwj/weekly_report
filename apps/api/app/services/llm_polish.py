"""Optional OpenAI-compatible LLM polish (architecture §6.2) — gated by FEATURE_LLM."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.config import get_settings


def polish_markdown_with_llm(*, base_markdown: str, commits: list[dict[str, Any]]) -> str:
    settings = get_settings()
    if not settings.feature_llm or not settings.llm_base_url:
        return base_markdown
    system = (
        "You rewrite weekly engineering reports. Rules: "
        "1) Output ONLY valid JSON with a single key \"markdown\" containing GitHub-flavored Markdown. "
        "2) Do NOT invent repository names, SHAs, URLs, ticket IDs, or people not present in the input. "
        "3) Preserve every factual link and short SHA from the input; you may regroup wording. "
        "4) If unsure, keep the original bullet list wording."
    )
    user_payload = {"draft_markdown": base_markdown, "commits_index": commits[:500]}
    url = settings.llm_base_url.rstrip("/") + "/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"
    body = {
        "model": settings.llm_model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
    }
    with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
        r = client.post(url, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
    content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content")) or ""
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return base_markdown
    md = parsed.get("markdown")
    if not isinstance(md, str) or not md.strip():
        return base_markdown
    # Post-validate: every URL in output should appear in input OR be substring of allowed commit URLs
    input_blob = base_markdown + json.dumps(commits, ensure_ascii=False)
    for m in re.finditer(r"https?://[^\s)>\]]+", md):
        link = m.group(0)
        if link not in input_blob and not any(link in str(c.get("url", "")) for c in commits):
            return base_markdown
    return md
