from ninja import ModelSchema
from ninja import Schema

from light_audit.audit.models import AuditVersion
from light_audit.audit.models import Building
from light_audit.audit.models import Project


class ProjectSchema(ModelSchema):
    building_count: int = 0

    class Meta:
        model = Project
        fields = [
            "id", "name", "client", "project_type", "status", "created", "modified",
        ]

    @staticmethod
    def resolve_building_count(obj: Project) -> int:
        return obj.buildings.count()


class ProjectCreateSchema(Schema):
    name: str
    client: str = ""
    project_type: str = "normal"
    status: str = "pending"


class BuildingSchema(ModelSchema):
    class Meta:
        model = Building
        fields = [
            "id", "name", "address", "building_type",
            "square_feet", "created", "modified",
        ]


class BuildingCreateSchema(Schema):
    name: str
    project_id: int
    address: str = ""
    building_type: str = ""
    square_feet: int | None = None


class AuditVersionSchema(ModelSchema):
    class Meta:
        model = AuditVersion
        fields = [
            "id", "version_number", "label", "status",
            "is_current", "created", "modified",
        ]
