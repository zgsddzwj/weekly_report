"""Post-report outbound webhooks (Slack-compatible) — architecture §6.3."""

from __future__ import annotations

import json
from typing import Any

import httpx


def notify_slack_incoming_webhook(url: str, text: str, run_id: int) -> None:
    if not url.startswith("https://"):
        return
    payload = {"text": f"Week Report #{run_id}\n\n{text[:3500]}"}
    with httpx.Client(timeout=15.0) as client:
        client.post(url, content=json.dumps(payload), headers={"Content-Type": "application/json"})


def notify_from_style(style: dict[str, Any], markdown: str, run_id: int) -> None:
    url = style.get("slack_incoming_webhook_url")
    if isinstance(url, str) and url:
        notify_slack_incoming_webhook(url, markdown, run_id)
