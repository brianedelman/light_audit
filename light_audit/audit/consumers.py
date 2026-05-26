"""Django Channels WebSocket consumers for audit review (US-046)."""

from __future__ import annotations

import asyncio
import threading

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import close_old_connections

from light_audit.audit.llm import run_agent
from light_audit.audit.models import AgentType
from light_audit.audit.models import AuditVersion
from light_audit.audit.models import LogEntry

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_system_prompt(audit_version: AuditVersion) -> str:
    """Return a system prompt containing the audit data context."""
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
                ) as (stream_mgr, _run):
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
