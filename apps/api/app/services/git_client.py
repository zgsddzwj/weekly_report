from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.models import GitConnection


def _parse_repos(text: str) -> list[str]:
    parts: list[str] = []
    for line in text.replace(",", "\n").splitlines():
        s = line.strip()
        if s:
            parts.append(s)
    return parts


def _github_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _gitlab_headers(token: str) -> dict[str, str]:
    return {"PRIVATE-TOKEN": token}


def _httpx_client() -> httpx.Client:
    """trust_env=True honors HTTP(S)_PROXY for corporate egress (architecture §3.3)."""
    return httpx.Client(timeout=60.0, trust_env=True)


def _request_with_github_rate_limit(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
    max_retries: int = 8,
) -> httpx.Response:
    """Enterprise-friendly backoff on HTTP 429 (architecture §8)."""
    backoff = 1.0
    for attempt in range(max_retries):
        r = client.request(method, url, headers=headers, params=params)
        if r.status_code == 429:
            ra = r.headers.get("Retry-After")
            wait_s = float(ra) if ra and ra.isdigit() else min(backoff, 120.0)
            time.sleep(wait_s)
            backoff = min(backoff * 2, 120.0)
            continue
        r.raise_for_status()
        return r
    raise RuntimeError("GitHub API rate limited after retries")


def _message_has_skip_ci_tag(message: str) -> bool:
    m = (message or "").lower()
    return "[skip ci]" in m or "[ci skip]" in m


def _should_skip_commit(
    message: str,
    is_merge: bool,
    hide_merge_commits: bool,
    hide_skip_ci_commits: bool,
) -> bool:
    if hide_merge_commits and is_merge:
        return True
    if hide_skip_ci_commits and _message_has_skip_ci_tag(message):
        return True
    return False


def fetch_commits_for_window(
    conn: GitConnection,
    token: str,
    repo_full_names: list[str],
    window_days: int,
    filters: dict[str, Any],
) -> list[dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    if conn.provider == "github":
        return _fetch_github(conn.base_url.rstrip("/"), token, repo_full_names, since, filters)
    if conn.provider == "gitlab":
        return _fetch_gitlab(conn.base_url.rstrip("/"), token, repo_full_names, since, filters)
    if conn.provider == "gitee":
        return _fetch_gitee(conn.base_url.rstrip("/"), token, repo_full_names, since, filters)
    raise ValueError(f"Unsupported provider: {conn.provider}")


def fetch_merged_prs_for_window(
    conn: GitConnection,
    token: str,
    repo_full_names: list[str],
    window_days: int,
    filters: dict[str, Any],
) -> list[dict[str, Any]]:
    """GitHub merged PRs within the window (architecture §6.1 data sources, phased)."""
    if conn.provider != "github":
        return []
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    ignore_bots = bool(filters.get("ignore_bots", True))
    headers = _github_headers(token)
    out: list[dict[str, Any]] = []
    with _httpx_client() as client:
        for full in repo_full_names:
            owner, _, name = full.partition("/")
            if not name:
                continue
            url = f"{conn.base_url.rstrip('/')}/repos/{owner}/{name}/pulls"
            params: dict[str, Any] = {"state": "closed", "sort": "updated", "direction": "desc", "per_page": 50}
            r = _request_with_github_rate_limit(client, "GET", url, headers=headers, params=params)
            data = r.json()
            if not isinstance(data, list):
                continue
            for pr in data:
                merged_at = pr.get("merged_at")
                if not merged_at:
                    continue
                try:
                    md = datetime.fromisoformat(merged_at.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if md < since:
                    break
                user = pr.get("user") or {}
                login = str(user.get("login") or "")
                if ignore_bots and login.endswith("[bot]"):
                    continue
                out.append(
                    {
                        "kind": "pr",
                        "repo": full,
                        "title": str(pr.get("title") or ""),
                        "author": login,
                        "date": merged_at,
                        "url": str(pr.get("html_url") or ""),
                    }
                )
    out.sort(key=lambda x: x.get("date") or "", reverse=True)
    return out


def _fetch_github(
    api_base: str,
    token: str,
    repos: list[str],
    since: datetime,
    filters: dict[str, Any],
) -> list[dict[str, Any]]:
    ignore_bots = bool(filters.get("ignore_bots", True))
    min_insertions = int(filters.get("min_insertions", 0) or 0)
    hide_merge_commits = bool(filters.get("hide_merge_commits", False))
    hide_skip_ci_commits = bool(filters.get("hide_skip_ci_commits", False))
    since_s = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    headers = _github_headers(token)
    results: list[dict[str, Any]] = []
    with _httpx_client() as client:
        for full in repos:
            owner, _, name = full.partition("/")
            if not name:
                continue
            url: str | None = f"{api_base}/repos/{owner}/{name}/commits"
            params: dict[str, Any] | None = {"since": since_s, "per_page": 100}
            while url:
                r = _request_with_github_rate_limit(client, "GET", url, headers=headers, params=params)
                data = r.json()
                if not isinstance(data, list):
                    break
                for c in data:
                    sha = c.get("sha", "")
                    commit = c.get("commit") or {}
                    msg = (commit.get("message") or "").split("\n")[0]
                    author = (commit.get("author") or {}).get("name") or ""
                    email = (commit.get("author") or {}).get("email") or ""
                    if ignore_bots and ("[bot]" in email or author.endswith("[bot]")):
                        continue
                    stats = c.get("stats") or {}
                    add = int(stats.get("additions") or 0)
                    if min_insertions > 0 and add < min_insertions:
                        continue
                    parents = c.get("parents") if isinstance(c.get("parents"), list) else []
                    is_merge = len(parents) > 1
                    if _should_skip_commit(msg, is_merge, hide_merge_commits, hide_skip_ci_commits):
                        continue
                    date_s = (commit.get("author") or {}).get("date") or ""
                    link = ""
                    if "github.com" in api_base:
                        link = f"https://github.com/{full}/commit/{sha}"
                    results.append(
                        {
                            "kind": "commit",
                            "repo": full,
                            "sha": sha[:7],
                            "full_sha": sha,
                            "message": msg,
                            "author": author,
                            "date": date_s,
                            "insertions": add,
                            "url": link,
                        }
                    )
                link_h = r.headers.get("Link", "")
                url = _next_github_url(link_h)
                params = None
    results.sort(key=lambda x: x.get("date") or "", reverse=True)
    return results


def _next_github_url(link_header: str) -> str | None:
    for part in link_header.split(","):
        if 'rel="next"' in part:
            return part.split(";")[0].strip().strip("<>")
    return None


def _fetch_gitee(
    api_base: str,
    token: str,
    repos: list[str],
    since: datetime,
    filters: dict[str, Any],
) -> list[dict[str, Any]]:
    """Gitee Open API v5 (architecture §6.1)."""
    ignore_bots = bool(filters.get("ignore_bots", True))
    min_insertions = int(filters.get("min_insertions", 0) or 0)
    hide_merge_commits = bool(filters.get("hide_merge_commits", False))
    hide_skip_ci_commits = bool(filters.get("hide_skip_ci_commits", False))
    since_s = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    results: list[dict[str, Any]] = []
    with _httpx_client() as client:
        for full in repos:
            owner, _, name = full.partition("/")
            if not name:
                continue
            page = 1
            while True:
                r = client.get(
                    f"{api_base}/repos/{owner}/{name}/commits",
                    params={
                        "access_token": token,
                        "since": since_s,
                        "per_page": 100,
                        "page": page,
                    },
                )
                r.raise_for_status()
                data = r.json()
                if not isinstance(data, list) or not data:
                    break
                for c in data:
                    commit = c.get("commit") or {}
                    msg = (commit.get("message") or "").split("\n")[0]
                    author = (commit.get("author") or {}).get("name") or ""
                    email = (commit.get("author") or {}).get("email") or ""
                    if ignore_bots and ("[bot]" in (email or "") or str(author).endswith("[bot]")):
                        continue
                    sha = c.get("sha") or ""
                    parents = c.get("parents") if isinstance(c.get("parents"), list) else []
                    is_merge = len(parents) > 1
                    if _should_skip_commit(msg, is_merge, hide_merge_commits, hide_skip_ci_commits):
                        continue
                    date_s = (commit.get("author") or {}).get("date") or ""
                    stats = c.get("stats") or {}
                    add = int(stats.get("additions") or 0) if isinstance(stats, dict) else 0
                    if min_insertions > 0 and add < min_insertions:
                        continue
                    html_url = str(c.get("html_url") or "")
                    results.append(
                        {
                            "kind": "commit",
                            "repo": full,
                            "sha": sha[:7] if sha else "",
                            "full_sha": sha,
                            "message": msg,
                            "author": author,
                            "date": date_s,
                            "insertions": add,
                            "url": html_url,
                        }
                    )
                if len(data) < 100:
                    break
                page += 1
    results.sort(key=lambda x: x.get("date") or "", reverse=True)
    return results


def _fetch_gitlab(
    api_base: str,
    token: str,
    repos: list[str],
    since: datetime,
    filters: dict[str, Any],
) -> list[dict[str, Any]]:
    ignore_bots = bool(filters.get("ignore_bots", True))
    min_insertions = int(filters.get("min_insertions", 0) or 0)
    hide_merge_commits = bool(filters.get("hide_merge_commits", False))
    hide_skip_ci_commits = bool(filters.get("hide_skip_ci_commits", False))
    headers = _gitlab_headers(token)
    since_s = since.isoformat()
    results: list[dict[str, Any]] = []
    with _httpx_client() as client:
        for full in repos:
            encoded = full.replace("/", "%2F")
            base = f"{api_base}/projects/{encoded}/repository/commits"
            page = 1
            while True:
                r = client.get(
                    base,
                    headers=headers,
                    params={"since": since_s, "per_page": 100, "page": page},
                )
                r.raise_for_status()
                data = r.json()
                if not isinstance(data, list) or not data:
                    break
                for c in data:
                    msg = (c.get("title") or c.get("message") or "").split("\n")[0]
                    author = c.get("author_name") or ""
                    email = c.get("author_email") or ""
                    if ignore_bots and ("[bot]" in (email or "") or str(author).endswith("[bot]")):
                        continue
                    sha = c.get("id") or ""
                    add = 0
                    if min_insertions > 0 and sha:
                        sr = client.get(
                            f"{api_base}/projects/{encoded}/repository/commits/{sha}",
                            headers=headers,
                        )
                        if sr.status_code == 200:
                            stats = sr.json().get("stats") or {}
                            add = int(stats.get("additions") or 0)
                    if min_insertions > 0 and add < min_insertions:
                        continue
                    parent_ids = c.get("parent_ids") if isinstance(c.get("parent_ids"), list) else []
                    is_merge = len(parent_ids) > 1
                    if _should_skip_commit(msg, is_merge, hide_merge_commits, hide_skip_ci_commits):
                        continue
                    date_s = c.get("committed_date") or ""
                    web = c.get("web_url") or ""
                    results.append(
                        {
                            "kind": "commit",
                            "repo": full,
                            "sha": sha[:7] if sha else "",
                            "full_sha": sha,
                            "message": msg,
                            "author": author,
                            "date": date_s,
                            "insertions": add,
                            "url": web,
                        }
                    )
                if len(data) < 100:
                    break
                page += 1
    results.sort(key=lambda x: x.get("date") or "", reverse=True)
    return results


def parse_repo_list(text: str) -> list[str]:
    return _parse_repos(text)
