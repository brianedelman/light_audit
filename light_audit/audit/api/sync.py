"""Sync API: POST /api/audits/sync — PWA pushes full audit payload."""

import uuid as _uuid_mod  # noqa: TC003
from typing import Any

from django.db import transaction
from ninja import Router
from ninja import Schema
from ninja.errors import HttpError

from light_audit.audit.models import AuditVersion
from light_audit.audit.models import Building
from light_audit.audit.models import Floor
from light_audit.audit.models import LogEntry
from light_audit.audit.models import Room

sync_router = Router(tags=["sync"])


# ---------- request schemas ----------

class LogEntryPayload(Schema):
    fixture_id: str = ""
    description: str = ""
    qty: int = 1
    wattage: float | None = None
    location: str = "interior"
    switch_type: str = ""
    controls: str = ""
    mount_type: str = ""
    notes: str = ""


class RoomPayload(Schema):
    name: str
    room_type: str = ""
    zone_label: str = ""
    notes: str = ""
    log_entries: list[LogEntryPayload] = []


class FloorPayload(Schema):
    name: str
    level: int | None = None
    sort_order: int = 0
    rooms: list[RoomPayload] = []


class AuditSyncPayload(Schema):
    floors: list[FloorPayload] = []


class SyncRequest(Schema):
    building_uuid: _uuid_mod.UUID
    client_uuid: _uuid_mod.UUID | None = None
    base_version_uuid: _uuid_mod.UUID | None = None
    payload: AuditSyncPayload


# ---------- response schemas ----------

class SyncResponse(Schema):
    version_id: int
    version_number: int
    client_uuid: _uuid_mod.UUID | None
    created: bool


# ---------- endpoint ----------

@sync_router.post("/sync", response=SyncResponse)
def sync_audit(request, data: SyncRequest):
    """
    Create a new AuditVersion snapshot from PWA payload.
    Idempotent: if client_uuid already exists, returns existing version.
    """
    # Idempotency check — if client_uuid supplied + already exists, return it
    if data.client_uuid is not None:
        existing = AuditVersion.objects.filter(
            client_uuid=data.client_uuid,
        ).first()
        if existing is not None:
            return SyncResponse(
                version_id=existing.pk,
                version_number=existing.version_number,
                client_uuid=existing.client_uuid,
                created=False,
            )

    building = Building.objects.filter(client_uuid=data.building_uuid).first()
    if building is None:
        raise HttpError(404, "Building not found")

    with transaction.atomic():
        version = AuditVersion.objects.create(
            building=building,
            created_by=request.user,
            client_uuid=data.client_uuid,
            source_payload=_payload_to_dict(data.payload),
        )
        _create_children(version, building, data.payload)

    return SyncResponse(
        version_id=version.pk,
        version_number=version.version_number,
        client_uuid=version.client_uuid,
        created=True,
    )


def _payload_to_dict(payload: AuditSyncPayload) -> dict[str, Any]:
    return payload.model_dump()


def _create_children(
    version: AuditVersion,
    building: Building,
    payload: AuditSyncPayload,
) -> None:
    for floor_data in payload.floors:
        floor = Floor.objects.create(
            building=building,
            audit_version=version,
            name=floor_data.name,
            level=floor_data.level,
            sort_order=floor_data.sort_order,
        )
        for room_data in floor_data.rooms:
            room = Room.objects.create(
                floor=floor,
                audit_version=version,
                name=room_data.name,
                room_type=room_data.room_type,
                zone_label=room_data.zone_label,
                notes=room_data.notes,
            )
            for entry_data in room_data.log_entries:
                LogEntry.objects.create(
                    room=room,
                    audit_version=version,
                    fixture_id=entry_data.fixture_id,
                    description=entry_data.description,
                    qty=entry_data.qty,
                    wattage=entry_data.wattage,
                    location=entry_data.location,
                    switch_type=entry_data.switch_type,
                    controls=entry_data.controls,
                    mount_type=entry_data.mount_type,
                    notes=entry_data.notes,
                )
