from ninja import ModelSchema
from ninja import Schema

from light_audit.audit.models import AuditVersion
from light_audit.audit.models import Building
from light_audit.audit.models import Floor
from light_audit.audit.models import LogEntry
from light_audit.audit.models import Project
from light_audit.audit.models import Room


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
    created_by_name: str = ""

    class Meta:
        model = AuditVersion
        fields = [
            "id", "version_number", "label", "status",
            "is_current", "created", "modified",
        ]

    @staticmethod
    def resolve_created_by_name(obj: AuditVersion) -> str:
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.email
        return ""


class RoomSchema(ModelSchema):
    class Meta:
        model = Room
        fields = ["id", "name", "room_type", "zone_label", "pin_code",
                  "square_feet", "notes", "created", "modified"]


class LogEntrySchema(ModelSchema):
    class Meta:
        model = LogEntry
        fields = [
            "id", "fixture_id", "qty", "wattage", "switch_type", "controls",
            "mount_type", "notes",
            "flag_integral_sensor", "flag_embb", "flag_air_return",
            "flag_wire_guard", "flag_volt_480", "flag_em_gen",
            "flag_photocell", "flag_twistlock_pc", "flag_wet_location",
            "flag_dark_sky",
            "created", "modified",
        ]


class FloorWithRoomsSchema(ModelSchema):
    rooms: list[RoomSchema] = []

    class Meta:
        model = Floor
        fields = ["id", "name", "level", "sort_order", "created", "modified"]

    @staticmethod
    def resolve_rooms(obj: Floor) -> list:
        return list(obj.rooms.all())
