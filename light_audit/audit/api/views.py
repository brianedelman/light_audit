from django.db.models import Count
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja import Schema
from ninja.errors import HttpError

from light_audit.audit.api.schema import AuditVersionSchema
from light_audit.audit.api.schema import BuildingCreateSchema
from light_audit.audit.api.schema import BuildingSchema
from light_audit.audit.api.schema import FloorWithRoomsSchema
from light_audit.audit.api.schema import ProjectCreateSchema
from light_audit.audit.api.schema import ProjectSchema
from light_audit.audit.api.schema import RoomSchema
from light_audit.audit.models import AuditVersion
from light_audit.audit.models import AuditVersionStatus
from light_audit.audit.models import Building
from light_audit.audit.models import Floor
from light_audit.audit.models import Project
from light_audit.audit.models import Room

projects_router = Router(tags=["projects"])
buildings_router = Router(tags=["buildings"])
audit_versions_router = Router(tags=["audit-versions"])


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
