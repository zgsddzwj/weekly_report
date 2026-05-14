"""Week Report CLI — 最小可运行命令行客户端 (architecture §6.3 CLI)."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

CONFIG_DIR = Path.home() / ".weekreport"
CONFIG_FILE = CONFIG_DIR / "config.json"


def _load_config() -> dict[str, str]:
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    return {}


def _save_config(cfg: dict[str, str]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def _client() -> httpx.Client:
    cfg = _load_config()
    base = cfg.get("url", "http://localhost:8000").rstrip("/")
    headers: dict[str, str] = {}
    token = cfg.get("token")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    org_id = cfg.get("org_id")
    if org_id:
        headers["X-Organization-Id"] = org_id
    return httpx.Client(base_url=f"{base}/api/v1", headers=headers, timeout=30.0)


def cmd_login(args: argparse.Namespace) -> None:
    cfg = {"url": args.url, "token": args.token}
    if args.org_id:
        cfg["org_id"] = args.org_id
    _save_config(cfg)
    print(f"Config saved to {CONFIG_FILE}")


def cmd_whoami(_args: argparse.Namespace) -> None:
    with _client() as client:
        r = client.get("/auth/me")
        r.raise_for_status()
        print(json.dumps(r.json(), indent=2, ensure_ascii=False))


def cmd_profiles_list(_args: argparse.Namespace) -> None:
    with _client() as client:
        r = client.get("/report-profiles")
        r.raise_for_status()
        for item in r.json():
            print(f"{item['id']}: {item['name']} (repos={item['repo_full_names']}, window={item['window_days']}d)")


def cmd_profiles_generate(args: argparse.Namespace) -> None:
    with _client() as client:
        r = client.post("/reports", json={"profile_id": args.profile_id, "trigger_source": "api"})
        r.raise_for_status()
        run = r.json()
        print(f"Run enqueued: id={run['id']} status={run['status']}")
        if args.wait:
            run_id = run["id"]
            while True:
                time.sleep(2)
                rr = client.get(f"/reports/{run_id}")
                rr.raise_for_status()
                data = rr.json()
                status = data["status"]
                print(f"  status={status}")
                if status in ("success", "failed"):
                    if status == "success" and data.get("result_markdown"):
                        print("\n--- Report ---\n")
                        print(data["result_markdown"])
                    elif status == "failed":
                        print(f"Error: {data.get('error_message')}", file=sys.stderr)
                    break


def cmd_reports_list(args: argparse.Namespace) -> None:
    with _client() as client:
        r = client.get("/reports", params={"limit": args.limit})
        r.raise_for_status()
        for item in r.json():
            print(
                f"run={item['id']} profile={item['profile_id']} status={item['status']} trigger={item['trigger_source']}"
            )


def cmd_reports_get(args: argparse.Namespace) -> None:
    with _client() as client:
        r = client.get(f"/reports/{args.run_id}")
        r.raise_for_status()
        print(json.dumps(r.json(), indent=2, ensure_ascii=False))


def cmd_reports_download(args: argparse.Namespace) -> None:
    with _client() as client:
        r = client.get(f"/reports/{args.run_id}")
        r.raise_for_status()
        data = r.json()
        md = data.get("result_markdown") or ""
        if not md:
            print("No markdown available.", file=sys.stderr)
            sys.exit(1)
        Path(args.output).write_text(md, encoding="utf-8")
        print(f"Saved to {args.output}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="weekreport", description="Week Report CLI")
    sub = parser.add_subparsers(dest="command")

    login_p = sub.add_parser("login", help="Save credentials")
    login_p.add_argument("--url", required=True, help="API base URL")
    login_p.add_argument("--token", required=True, help="JWT access token")
    login_p.add_argument("--org-id", help="Default organization id")
    login_p.set_defaults(func=cmd_login)

    whoami_p = sub.add_parser("whoami", help="Verify token")
    whoami_p.set_defaults(func=cmd_whoami)

    prof_p = sub.add_parser("profiles", help="Report profiles")
    prof_sub = prof_p.add_subparsers(dest="subcommand")

    pl = prof_sub.add_parser("list", help="List profiles")
    pl.set_defaults(func=cmd_profiles_list)

    pg = prof_sub.add_parser("generate", help="Generate report from profile")
    pg.add_argument("profile_id", type=int)
    pg.add_argument("--wait", action="store_true", help="Poll until complete")
    pg.set_defaults(func=cmd_profiles_generate)

    rep_p = sub.add_parser("reports", help="Report runs")
    rep_sub = rep_p.add_subparsers(dest="subcommand")

    rl = rep_sub.add_parser("list", help="List runs")
    rl.add_argument("--limit", type=int, default=20)
    rl.set_defaults(func=cmd_reports_list)

    rg = rep_sub.add_parser("get", help="Get a run")
    rg.add_argument("run_id", type=int)
    rg.set_defaults(func=cmd_reports_get)

    rd = rep_sub.add_parser("download", help="Download markdown")
    rd.add_argument("run_id", type=int)
    rd.add_argument("-o", "--output", default="report.md")
    rd.set_defaults(func=cmd_reports_download)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)
    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
