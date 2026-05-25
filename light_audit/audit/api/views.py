from django.shortcuts import get_object_or_404
from ninja import Router

from light_audit.audit.api.schema import AuditVersionSchema
from light_audit.audit.api.schema import BuildingCreateSchema
from light_audit.audit.api.schema import BuildingSchema
from light_audit.audit.api.schema import ProjectCreateSchema
from light_audit.audit.api.schema import ProjectSchema
from light_audit.audit.models import AuditVersion
from light_audit.audit.models import Building
from light_audit.audit.models import Project

projects_router = Router(tags=["projects"])
buildings_router = Router(tags=["buildings"])
audit_versions_router = Router(tags=["audit-versions"])


# --- Projects ---

@projects_router.get("/", response=list[ProjectSchema])
def list_projects(request):
    return Project.objects.all()


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


# --- Audit Versions ---

@audit_versions_router.get("/", response=list[AuditVersionSchema])
def list_audit_versions(request):
    return AuditVersion.objects.all()


@audit_versions_router.get("/{version_id}/", response=AuditVersionSchema)
def retrieve_audit_version(request, version_id: int):
    return get_object_or_404(AuditVersion, pk=version_id)
