"""Django Channels WebSocket consumers for audit review (US-046, US-049)."""

from __future__ import annotations

import asyncio
import json
import re
import threading
from typing import Any

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import close_old_connections

from light_audit.audit.llm import run_agent
from light_audit.audit.models import AgentRun
from light_audit.audit.models import AgentType
from light_audit.audit.models import AuditFlag
from light_audit.audit.models import AuditVersion
from light_audit.audit.models import FlagSeverity
from light_audit.audit.models import FlagStatus
from light_audit.audit.models import LogEntry
from light_audit.audit.models import Project

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FLAGS_BLOCK_RE = re.compile(r"```flags\s*\n(.*?)\n```", re.DOTALL)


def _parse_flags_from_response(text: str) -> list[dict[str, Any]]:
    """Extract structured flag data from a Claude response.

    Claude is expected to emit a fenced block like::

        ```flags
        [{"log_entry_id": 1, "severity": "warn", "message": "..."}]
        ```

    Returns a list of dicts; empty list if none found or JSON invalid.
    """
    match = _FLAGS_BLOCK_RE.search(text)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
        if isinstance(data, list):
            return data  # type: ignore[return-value]
    except (json.JSONDecodeError, ValueError):
        pass
    return []


def _persist_flags(
    flags_data: list[dict[str, Any]],
    audit_version: AuditVersion,
    agent_run: AgentRun,
) -> None:
    """Create AuditFlag rows from parsed flag data.

    Each item should have: log_entry_id (int), severity (str), message (str).
    Rows with unknown log_entry_id are silently skipped.
    """
    if not flags_data:
        return

    valid_severities = {s.value for s in FlagSeverity}
    # Fetch valid log entry ids for this audit_version in one query
    valid_ids = set(
        LogEntry.objects.filter(audit_version=audit_version).values_list("pk", flat=True)
    )

    to_create = []
    for item in flags_data:
        log_entry_id = item.get("log_entry_id")
        severity = item.get("severity", FlagSeverity.INFO)
        message = str(item.get("message", "")).strip()

        if not isinstance(log_entry_id, int) or log_entry_id not in valid_ids:
            continue
        if severity not in valid_severities:
            severity = FlagSeverity.INFO
        if not message:
            continue

        to_create.append(
            AuditFlag(
                log_entry_id=log_entry_id,
                audit_version=audit_version,
                severity=severity,
                message=message,
                status=FlagStatus.ACTIVE,
                source_run=agent_run,
            )
        )

    if to_create:
        AuditFlag.objects.bulk_create(to_create)


def _build_system_prompt(audit_version: AuditVersion) -> str:
    """Return a system prompt containing the audit data context.

    Includes dismissed flags and their reasons so Claude can incorporate
    reviewer feedback into subsequent analyses.
    """
    building = audit_version.building
    project = building.project

    lines = [
        "You are an expert lighting auditor reviewing field audit data.",
        f"Project: {project.name} (client: {project.client})",
        f"Building: {building.name}, address: {building.address}",
        f"Audit version: v{audit_version.version_number}"
        f" (status: {audit_version.status})",
        "",
        "Log entries (up to 200 shown):",
    ]

    entries = (
        LogEntry.objects.filter(audit_version=audit_version)
        .select_related("room__floor")
        .order_by("room__floor__sort_order", "pk")[:200]
    )

    for entry in entries:
        room_name = entry.room.name if entry.room else "unknown"
        floor_name = (
            entry.room.floor.name if (entry.room and entry.room.floor) else "unknown"
        )
        active_flags = [
            label
            for label, value in [
                ("IS", entry.flag_integral_sensor),
                ("EMBB", entry.flag_embb),
                ("AR", entry.flag_air_return),
                ("WG", entry.flag_wire_guard),
                ("480V", entry.flag_volt_480),
                ("EM-GEN", entry.flag_em_gen),
                ("PC", entry.flag_photocell),
                ("PC-TL", entry.flag_twistlock_pc),
                ("WET", entry.flag_wet_location),
                ("DARK-SKY", entry.flag_dark_sky),
            ]
            if value
        ]
        flag_str = f" [flags: {','.join(active_flags)}]" if active_flags else ""
        wattage = entry.wattage if entry.wattage is not None else "?"
        lines.append(
            f"  {floor_name}/{room_name}: "
            f"{entry.fixture_id or 'entry'} x{entry.qty} {wattage}W"
            f"{flag_str}",
        )

    # Inject dismissed flags so Claude knows what was already reviewed
    dismissed = (
        AuditFlag.objects.filter(
            audit_version=audit_version,
            status=FlagStatus.DISMISSED,
        )
        .select_related("log_entry")
        .order_by("pk")
    )
    dismissed_list = list(dismissed)
    if dismissed_list:
        lines.append("")
        lines.append(
            "Previously dismissed flags (reviewer has already addressed these):"
        )
        for flag in dismissed_list:
            entry_id = (
                flag.log_entry.fixture_id or f"entry#{flag.log_entry_id}"
                if flag.log_entry
                else f"entry#{flag.log_entry_id}"
            )
            reason = flag.dismissed_reason or "(no reason given)"
            lines.append(
                f"  [{flag.severity}] {entry_id}: {flag.message} "
                f"— dismissed: {reason}"
            )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Consumer
# ---------------------------------------------------------------------------


class AuditReviewConsumer(AsyncJsonWebsocketConsumer):
    """Streaming chat consumer for audit review.

    URL: /ws/audit-review/{audit_version_id}/

    Incoming message: { "prompt": "<string>", "predefined_prompt_id": null }
    Outgoing messages:
      { "type": "token", "text": "<string>" }  -- streamed tokens
      { "type": "done" }                        -- stream complete
      { "type": "error", "message": "<string>" }
    """

    async def connect(self) -> None:
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4003)
            return

        version_id = self.scope["url_route"]["kwargs"]["audit_version_id"]
        try:
            self.audit_version: AuditVersion = await asyncio.to_thread(
                lambda: AuditVersion.objects.select_related(
                    "building__project",
                ).get(pk=version_id),
            )
        except AuditVersion.DoesNotExist:
            await self.close(code=4004)
            return

        self.history: list[dict] = []
        await self.accept()

    async def receive_json(self, content: dict) -> None:  # type: ignore[override]
        prompt = content.get("prompt", "")
        if not prompt:
            await self.send_json({"type": "error", "message": "prompt required"})
            return

        user = self.scope["user"]
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        full_tokens: list[str] = []

        self.history.append({"role": "user", "content": prompt})
        messages = list(self.history)
        audit_version = self.audit_version

        def _stream() -> None:
            close_old_connections()
            try:
                system_prompt = _build_system_prompt(audit_version)
                project = audit_version.building.project

                # Inject system context into the first user turn only
                if len(messages) == 1:
                    augmented = [
                        {
                            "role": "user",
                            "content": f"{system_prompt}\n\n{messages[0]['content']}",
                        },
                    ]
                else:
                    augmented = messages

                with run_agent(
                    AgentType.AUDIT_REVIEW,
                    user,
                    project,
                    audit_version,
                    augmented,
                    stream=True,
                ) as (stream_mgr, agent_run):
                    for token in stream_mgr.text_stream:
                        full_tokens.append(token)
                        loop.call_soon_threadsafe(queue.put_nowait, token)

                # Parse and persist any flags emitted in the response
                full_text = "".join(full_tokens)
                flags_data = _parse_flags_from_response(full_text)
                if flags_data:
                    _persist_flags(flags_data, audit_version, agent_run)
            except Exception as exc:  # noqa: BLE001
                loop.call_soon_threadsafe(
                    queue.put_nowait, f"__error__{exc}",
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        threading.Thread(target=_stream, daemon=True).start()

        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, str) and item.startswith("__error__"):
                await self.send_json({"type": "error", "message": item[9:]})
                return
            await self.send_json({"type": "token", "text": item})

        self.history.append({"role": "assistant", "content": "".join(full_tokens)})
        await self.send_json({"type": "done"})

# ---------------------------------------------------------------------------
# Project chatbot consumer (US-053)
# ---------------------------------------------------------------------------


def _build_project_prompt(project: Project) -> str:
    """Return a scope-limited system prompt with only project metadata.

    Intentionally excludes audit log entries and spec data.
    """
    buildings = list(project.buildings.all()[:20])
    building_lines = [
        f"  - {b.name} ({b.address or 'no address'})"
        for b in buildings
    ]
    lines = [
        "You are an internal assistant for a lighting audit company.",
        f"Project: {project.name}",
        f"Client: {project.client or '(none)'}",
        f"Type: {project.project_type}",
        f"Status: {project.status}",
        f"Buildings ({len(buildings)}):",
        *building_lines,
        "",
        "Answer questions about this project. Do not reference or invent audit log "
        "data, fixture specifications, or other project data not shown above.",
    ]
    return "\n".join(lines)


class ProjectChatConsumer(AsyncJsonWebsocketConsumer):
    """Streaming chatbot consumer scoped to a single project.

    URL: /ws/project-chat/{project_id}/

    Incoming message: { "prompt": "<string>" }
    Outgoing messages:
      { "type": "token", "text": "<string>" }
      { "type": "done" }
      { "type": "error", "message": "<string>" }
    """

    async def connect(self) -> None:
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4003)
            return

        project_id = self.scope["url_route"]["kwargs"]["project_id"]
        try:
            self.project: Project = await asyncio.to_thread(
                lambda: Project.objects.prefetch_related("buildings").get(
                    pk=project_id,
                ),
            )
        except Project.DoesNotExist:
            await self.close(code=4004)
            return

        self.history: list[dict] = []
        await self.accept()

    async def receive_json(self, content: dict) -> None:  # type: ignore[override]
        prompt = content.get("prompt", "")
        if not prompt:
            await self.send_json({"type": "error", "message": "prompt required"})
            return

        user = self.scope["user"]
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[str | None] = asyncio.Queue()
        full_tokens: list[str] = []

        self.history.append({"role": "user", "content": prompt})
        messages = list(self.history)
        project = self.project

        def _stream() -> None:
            close_old_connections()
            try:
                system_prompt = _build_project_prompt(project)

                # Inject system context into the first user turn only
                if len(messages) == 1:
                    augmented = [
                        {
                            "role": "user",
                            "content": f"{system_prompt}\n\n{messages[0]['content']}",
                        },
                    ]
                else:
                    augmented = messages

                with run_agent(
                    AgentType.CHATBOT,
                    user,
                    project,
                    None,
                    augmented,
                    stream=True,
                ) as (stream_mgr, _agent_run):
                    for token in stream_mgr.text_stream:
                        full_tokens.append(token)
                        loop.call_soon_threadsafe(queue.put_nowait, token)

            except Exception as exc:  # noqa: BLE001
                loop.call_soon_threadsafe(
                    queue.put_nowait, f"__error__{exc}",
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        threading.Thread(target=_stream, daemon=True).start()

        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, str) and item.startswith("__error__"):
                await self.send_json({"type": "error", "message": item[9:]})
                return
            await self.send_json({"type": "token", "text": item})

        self.history.append({"role": "assistant", "content": "".join(full_tokens)})
        await self.send_json({"type": "done"})
