"""LLM 智能生成周报 — 从提交记录直接生成结构化 Markdown (architecture §6.2)."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import get_settings


_TONE_HINTS: dict[str, str] = {
    "neutral": "",
    "brief": "Tone: concise and brief. Keep each section short. Use bullet points heavily.",
    "formal": "Tone: formal and detailed. Use professional business language suitable for manager review.",
    "technical": "Tone: deep technical focus. Explain architectural decisions, code changes, and engineering trade-offs.",
    "business": "Tone: business-value oriented. Connect commits to product features, user impact, and business outcomes.",
}


def _system_prompt_for_tone(tone: str, custom_tone: str | None) -> str:
    tone_rule = ""
    if custom_tone:
        tone_rule = f"写作风格要求（优先遵循）：{custom_tone}\n"
    elif tone in _TONE_HINTS and _TONE_HINTS[tone]:
        tone_rule = _TONE_HINTS[tone] + "\n"
    return (
        "You are a technical weekly report generator. Your task is to read the provided Git commits and pull requests, and generate a structured weekly report in Markdown.\n"
        "\n"
        f"{tone_rule}"
        "\n"
        "Rules (strict):\n"
        "1. Output ONLY valid JSON with this exact structure:\n"
        '   {"title": "Weekly Report Title", "sections": [{"heading": "...", "content": "..."}]}\n'
        "2. Do NOT invent any repository names, SHAs, URLs, ticket IDs, or people not present in the input.\n"
        "3. Preserve every factual link and short SHA from the input commits.\n"
        "4. Group related commits by repository or theme when possible.\n"
        "5. Use concise, professional Chinese language (unless input asks for English).\n"
        "6. If there are no commits in the window, state that clearly.\n"
        "7. The \"content\" of each section should be valid Markdown.\n"
    )


def _build_user_message(
    *,
    commits: list[dict[str, Any]],
    prs: list[dict[str, Any]],
    profile_name: str,
    window_days: int,
    repos: list[str],
    style: dict[str, Any],
) -> str:
    language = style.get("language", "zh")
    tone = style.get("tone", "neutral")
    title_hint = style.get("title") or ("Weekly Report" if language == "en" else f"{profile_name} 工作周报")

    tone_hint = ""
    if tone == "brief":
        tone_hint = "Tone: concise and brief. Keep each section short.\n"
    elif tone == "formal":
        tone_hint = "Tone: formal and detailed.\n"

    commit_text = json.dumps(commits[:500], ensure_ascii=False, indent=2)
    pr_text = json.dumps(prs[:200], ensure_ascii=False, indent=2) if prs else "[]"

    return (
        f"Profile: {profile_name}\n"
        f"Window: last {window_days} days\n"
        f"Repositories: {', '.join(repos)}\n"
        f"Title hint: {title_hint}\n"
        f"{tone_hint}"
        f"\nCommits:\n{commit_text}\n"
        f"\nPull Requests:\n{pr_text}\n"
    )


def _render_sections_to_markdown(title: str, sections: list[dict[str, str]]) -> str:
    lines = [f"# {title}", ""]
    for sec in sections:
        heading = sec.get("heading", "")
        content = sec.get("content", "")
        if heading:
            lines.append(f"## {heading}")
            lines.append("")
        if content:
            lines.append(content)
            lines.append("")
    return "\n".join(lines)


def generate_report_with_llm(
    *,
    commits: list[dict[str, Any]],
    prs: list[dict[str, Any]],
    profile_name: str,
    window_days: int,
    repos: list[str],
    style: dict[str, Any],
) -> str:
    """Call LLM to generate a structured weekly report from commits/PRs.
    Raises RuntimeError on failure so the caller can fall back to template rendering.
    """
    settings = get_settings()
    if not settings.feature_llm or not settings.llm_base_url:
        raise RuntimeError("LLM is not configured")

    user_msg = _build_user_message(
        commits=commits,
        prs=prs,
        profile_name=profile_name,
        window_days=window_days,
        repos=repos,
        style=style,
    )

    url = settings.llm_base_url.rstrip("/") + "/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"

    tone = style.get("tone", "neutral")
    custom_tone = style.get("custom_tone")
    body = {
        "model": settings.llm_model,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": _system_prompt_for_tone(tone, custom_tone)},
            {"role": "user", "content": user_msg},
        ],
        "response_format": {"type": "json_object"},
    }

    with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
        r = client.post(url, headers=headers, json=body)
        r.raise_for_status()
        data = r.json()

    content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content")) or ""
    if not content:
        raise RuntimeError("LLM returned empty content")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"LLM returned invalid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError("LLM JSON is not an object")

    title = parsed.get("title") or f"{profile_name} 工作周报"
    sections = parsed.get("sections")
    if not isinstance(sections, list) or not sections:
        raise RuntimeError("LLM JSON missing 'sections' array")

    md = _render_sections_to_markdown(title, sections)

    # Post-validate: ensure no hallucinated URLs
    input_blob = user_msg
    for m in __import__("re").finditer(r"https?://[^\s)>\]]+", md):
        link = m.group(0)
        if link not in input_blob and not any(link in str(c.get("url", "")) for c in commits):
            raise RuntimeError(f"LLM hallucinated URL: {link}")

    return md
