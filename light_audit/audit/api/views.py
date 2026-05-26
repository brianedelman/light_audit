import csv
import io

import openpyxl
from django.db.models import Count
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja import Schema
from ninja.errors import HttpError

from light_audit.audit.api.schema import AuditFlagSchema
from light_audit.audit.api.schema import AuditVersionSchema
from light_audit.audit.api.schema import BuildingCreateSchema
from light_audit.audit.api.schema import BuildingSchema
from light_audit.audit.api.schema import FloorWithRoomsSchema
from light_audit.audit.api.schema import LogEntrySchema
from light_audit.audit.api.schema import PhotoSchema
from light_audit.audit.api.schema import PredefinedPromptSchema
from light_audit.audit.api.schema import ProjectCreateSchema
from light_audit.audit.api.schema import ProjectSchema
from light_audit.audit.api.schema import RoomSchema
from light_audit.audit.models import AuditFlag
from light_audit.audit.models import AuditVersion
from light_audit.audit.models import AuditVersionStatus
from light_audit.audit.models import Building
from light_audit.audit.models import Floor
from light_audit.audit.models import LogEntry
from light_audit.audit.models import Photo
from light_audit.audit.models import PhotoUploadStatus
from light_audit.audit.models import PredefinedPrompt
from light_audit.audit.models import Project
from light_audit.audit.models import Room

projects_router = Router(tags=["projects"])
buildings_router = Router(tags=["buildings"])
audit_versions_router = Router(tags=["audit-versions"])
audit_flags_router = Router(tags=["audit-flags"])
predefined_prompts_router = Router(tags=["predefined-prompts"])


# --- Projects ---

@projects_router.get("/", response=list[ProjectSchema])
def list_projects(request):
    return Project.objects.annotate(building_count=Count("buildings")).all()


@projects_router.post("/", response=ProjectSchema)
def create_project(request, data: ProjectCreateSchema):
    return Project.objects.create(owner=request.user, **data.dict())


@projects_router.get("/{project_id}/", response=ProjectSchema)
def retrieve_project(request, project_id: int):
    return get_object_or_404(Project, pk=project_id)


@projects_router.get("/{project_id}/buildings/", response=list[BuildingSchema])
def list_project_buildings(request, project_id: int):
    project = get_object_or_404(Project, pk=project_id)
    return project.buildings.all()


@projects_router.get("/{project_id}/audits/", response=list[AuditVersionSchema])
def list_project_audits(request, project_id: int):
    project = get_object_or_404(Project, pk=project_id)
    return AuditVersion.objects.filter(building__project=project)


# --- Buildings ---

@buildings_router.get("/", response=list[BuildingSchema])
def list_buildings(request):
    return Building.objects.all()


@buildings_router.post("/", response=BuildingSchema)
def create_building(request, data: BuildingCreateSchema):
    project = get_object_or_404(Project, pk=data.project_id)
    payload = data.dict()
    payload.pop("project_id")
    return Building.objects.create(project=project, **payload)


@buildings_router.get("/{building_id}/", response=BuildingSchema)
def retrieve_building(request, building_id: int):
    return get_object_or_404(Building, pk=building_id)


@buildings_router.get(
    "/{building_id}/audit-versions/", response=list[AuditVersionSchema],
)
def list_building_audit_versions(request, building_id: int):
    building = get_object_or_404(Building, pk=building_id)
    return building.audit_versions.all()


@buildings_router.get(
    "/{building_id}/available-version/", response=AuditVersionSchema | None,
)
def get_available_version(request, building_id: int):
    """Return the latest published_to_ipad version for a building, if one exists."""
    building = get_object_or_404(Building, pk=building_id)
    return (
        building.audit_versions.filter(
            status=AuditVersionStatus.PUBLISHED_TO_IPAD,
        )
        .order_by("-version_number")
        .first()
    )


# --- Audit Versions ---

@audit_versions_router.get("/", response=list[AuditVersionSchema])
def list_audit_versions(request):
    return AuditVersion.objects.all()


@audit_versions_router.get("/{version_id}/", response=AuditVersionSchema)
def retrieve_audit_version(request, version_id: int):
    return get_object_or_404(AuditVersion, pk=version_id)


class PushToIpadResponse(Schema):
    version_id: int
    status: str


@audit_versions_router.post(
    "/{version_id}/push-to-ipad/", response=PushToIpadResponse,
)
def push_to_ipad(request, version_id: int):
    """Set audit version status to published_to_ipad."""
    version = get_object_or_404(AuditVersion, pk=version_id)
    if version.status == AuditVersionStatus.PUBLISHED:
        msg = "Cannot push a published version to iPad."
        raise HttpError(409, msg)
    version.status = AuditVersionStatus.PUBLISHED_TO_IPAD
    version.save()
    return PushToIpadResponse(version_id=version.pk, status=version.status)


@audit_versions_router.get("/{version_id}/floors/", response=list[FloorWithRoomsSchema])
def list_version_floors(request, version_id: int):
    version = get_object_or_404(AuditVersion, pk=version_id)
    return Floor.objects.filter(audit_version=version).prefetch_related("rooms")


@audit_versions_router.get("/{version_id}/rooms/{room_id}/", response=RoomSchema)
def retrieve_version_room(request, version_id: int, room_id: int):
    return get_object_or_404(Room, pk=room_id, audit_version_id=version_id)


@audit_versions_router.get(
    "/{version_id}/rooms/{room_id}/log-entries/", response=list[LogEntrySchema],
)
def list_room_log_entries(request, version_id: int, room_id: int):
    get_object_or_404(Room, pk=room_id, audit_version_id=version_id)
    return LogEntry.objects.filter(room_id=room_id)


@audit_versions_router.get(
    "/{version_id}/rooms/{room_id}/photos/", response=list[PhotoSchema],
)
def list_room_photos(request, version_id: int, room_id: int):
    get_object_or_404(Room, pk=room_id, audit_version_id=version_id)
    return Photo.objects.filter(room_id=room_id, upload_status=PhotoUploadStatus.UPLOADED)


@audit_versions_router.post(
    "/{version_id}/duplicate/", response=AuditVersionSchema,
)
def duplicate_audit_version(request, version_id: int):
    """Create a new draft version copied from an existing version."""
    source = get_object_or_404(AuditVersion, pk=version_id)
    label = f"Copy of {source.label}" if source.label else f"Copy of v{source.version_number}"
    new_version = AuditVersion.objects.create(
        building=source.building,
        created_by=request.user,
        label=label,
        status=AuditVersionStatus.DRAFT,
        source_payload=source.source_payload,
        is_current=False,
    )
    return new_version


@audit_versions_router.get(
    "/{version_id}/rooms/{room_id}/audit-flags/", response=list[AuditFlagSchema],
)
def list_room_audit_flags(request, version_id: int, room_id: int):
    get_object_or_404(Room, pk=room_id, audit_version_id=version_id)
    return AuditFlag.objects.filter(log_entry__room_id=room_id)


_EXPORT_COLUMNS = [
    "floor", "room", "fixture_id", "description", "qty", "wattage",
    "mount_type", "mount_height", "switch_type", "controls", "optic",
    "location", "facility", "space_zone", "ctrl_hours", "notes",
    "flag_integral_sensor", "flag_embb", "flag_air_return", "flag_wire_guard",
    "flag_volt_480", "flag_em_gen", "flag_photocell", "flag_twistlock_pc",
    "flag_wet_location", "flag_dark_sky", "active_flags",
]


def _build_export_rows(version_id: int) -> list[list]:
    """Return header + data rows for audit version export."""
    version = get_object_or_404(AuditVersion, pk=version_id)
    entries = (
        LogEntry.objects.filter(audit_version=version)
        .select_related("room__floor")
        .order_by("room__floor__sort_order", "room__name", "fixture_id")
    )
    # Build map of log_entry_id → active flags summary
    active_flags = AuditFlag.objects.filter(
        audit_version=version, status="active",
    ).values("log_entry_id", "severity", "message")
    flags_by_entry: dict[int, list[str]] = {}
    for f in active_flags:
        flags_by_entry.setdefault(f["log_entry_id"], []).append(
            f"{f['severity'].upper()}: {f['message']}",
        )

    rows: list[list] = [_EXPORT_COLUMNS]
    for e in entries:
        floor_name = e.room.floor.name if e.room and e.room.floor else ""
        room_name = e.room.name if e.room else ""
        flag_text = " | ".join(flags_by_entry.get(e.pk, []))
        rows.append([
            floor_name, room_name, e.fixture_id, e.description, e.qty,
            float(e.wattage) if e.wattage is not None else "",
            e.mount_type, e.mount_height, e.switch_type, e.controls, e.optic,
            e.location, e.facility, e.space_zone,
            float(e.ctrl_hours) if e.ctrl_hours is not None else "",
            e.notes,
            e.flag_integral_sensor, e.flag_embb, e.flag_air_return, e.flag_wire_guard,
            e.flag_volt_480, e.flag_em_gen, e.flag_photocell, e.flag_twistlock_pc,
            e.flag_wet_location, e.flag_dark_sky,
            flag_text,
        ])
    return rows


@audit_versions_router.get("/{version_id}/export/xlsx/")
def export_audit_xlsx(request, version_id: int):
    rows = _build_export_rows(version_id)
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(
        buf.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="audit-{version_id}.xlsx"'
    return response


@audit_versions_router.get("/{version_id}/export/csv/")
def export_audit_csv(request, version_id: int):
    rows = _build_export_rows(version_id)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerows(rows)
    response = HttpResponse(buf.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="audit-{version_id}.csv"'
    return response


# --- Audit Flags ---

class DismissRequest(Schema):
    reason: str = ""


@audit_flags_router.post("/{flag_id}/dismiss/", response=AuditFlagSchema)
def dismiss_audit_flag(request, flag_id: int, data: DismissRequest):
    flag = get_object_or_404(AuditFlag, pk=flag_id)
    flag.dismiss(user=request.user, reason=data.reason)
    return flag


# --- Predefined Prompts ---

@predefined_prompts_router.get("/", response=list[PredefinedPromptSchema])
def list_predefined_prompts(request):
    return PredefinedPrompt.objects.filter(active=True)
