"""Plugin boundary for PM tools (architecture §6.5) — default no-op."""

from __future__ import annotations

from typing import Any, Protocol


class ProjectManagementPlugin(Protocol):
    name: str

    def enrich_context(self, commits: list[dict[str, Any]], window_days: int) -> dict[str, Any]:
        """Return extra template variables (facts only; never invent tickets)."""


class JiraStubPlugin:
    name = "jira"

    def enrich_context(self, commits: list[dict[str, Any]], window_days: int) -> dict[str, Any]:
        return {"jira": {"enabled": False, "note": "Configure Jira integration in a future release."}}


def get_active_pm_plugin() -> ProjectManagementPlugin:
    return JiraStubPlugin()
