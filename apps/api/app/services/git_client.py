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


def fetch_commits_for_window(
    conn: GitConnection,
    token: str,
    repo_full_names: list[str],
    window_days: int,
    filters: dict[str, Any],
) -> list[dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    ignore_bots = bool(filters.get("ignore_bots", True))
    min_insertions = int(filters.get("min_insertions", 0) or 0)
    if conn.provider == "github":
        return _fetch_github(conn.base_url.rstrip("/"), token, repo_full_names, since, ignore_bots, min_insertions)
    if conn.provider == "gitlab":
        return _fetch_gitlab(conn.base_url.rstrip("/"), token, repo_full_names, since, ignore_bots, min_insertions)
    raise ValueError(f"Unsupported provider: {conn.provider}")


def _fetch_github(
    api_base: str,
    token: str,
    repos: list[str],
    since: datetime,
    ignore_bots: bool,
    min_insertions: int,
) -> list[dict[str, Any]]:
    since_s = since.strftime("%Y-%m-%dT%H:%M:%SZ")
    headers = _github_headers(token)
    results: list[dict[str, Any]] = []
    with httpx.Client(timeout=60.0) as client:
        for full in repos:
            owner, _, name = full.partition("/")
            if not name:
                continue
            url: str | None = f"{api_base}/repos/{owner}/{name}/commits"
            params: dict[str, Any] | None = {"since": since_s, "per_page": 100}
            while url:
                r = client.get(url, headers=headers, params=params)
                r.raise_for_status()
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
                    date_s = (commit.get("author") or {}).get("date") or ""
                    link = ""
                    if api_base.rstrip("/").endswith("api.github.com"):
                        link = f"https://github.com/{full}/commit/{sha}"
                    results.append(
                        {
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


def _fetch_gitlab(
    api_base: str,
    token: str,
    repos: list[str],
    since: datetime,
    ignore_bots: bool,
    min_insertions: int,
) -> list[dict[str, Any]]:
    headers = _gitlab_headers(token)
    since_s = since.isoformat()
    results: list[dict[str, Any]] = []
    with httpx.Client(timeout=60.0) as client:
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
                    date_s = c.get("committed_date") or ""
                    web = c.get("web_url") or ""
                    results.append(
                        {
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
