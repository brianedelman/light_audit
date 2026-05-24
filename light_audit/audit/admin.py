from django.contrib import admin

from .models import AuditVersion
from .models import Building
from .models import CatalogModifier
from .models import CatalogProduct
from .models import Floor
from .models import FloorPlan
from .models import FloorPlanPin
from .models import LightLevelReading
from .models import LogEntry
from .models import ProductAccessory
from .models import Project
from .models import Room
from .models import RoomNote
from .models import RoomPhoto
from .models import SpecItem


class FloorInline(admin.TabularInline):
    model = Floor
    extra = 0


class RoomInline(admin.TabularInline):
    model = Room
    extra = 0
    show_change_link = True


class LogEntryInline(admin.TabularInline):
    model = LogEntry
    extra = 0
    show_change_link = True
    fields = (
        "fixture_id",
        "description",
        "qty",
        "wattage",
        "mount_type",
        "switch_type",
    )


class SpecItemInline(admin.TabularInline):
    model = SpecItem
    extra = 0


class RoomPhotoInline(admin.TabularInline):
    model = RoomPhoto
    extra = 0


class RoomNoteInline(admin.TabularInline):
    model = RoomNote
    extra = 0


class FloorPlanPinInline(admin.TabularInline):
    model = FloorPlanPin
    extra = 0


class LightLevelReadingInline(admin.TabularInline):
    model = LightLevelReading
    extra = 0


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "client",
        "project_type",
        "status",
        "owner",
        "modified",
    )
    list_filter = ("status", "project_type")
    search_fields = ("name", "project_type", "client")


@admin.register(AuditVersion)
class AuditVersionAdmin(admin.ModelAdmin):
    list_display = (
        "building",
        "version_number",
        "label",
        "status",
        "created_by",
        "created",
    )
    list_filter = ("status", "building")
    search_fields = ("building__name", "label")
    readonly_fields = ("version_number",)


@admin.register(Building)
class BuildingAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "building_type",
        "state",
        "square_feet",
        "modified",
    )
    list_filter = ("building_type", "state")
    search_fields = ("name", "address", "project__client", "auditor", "utility")
    inlines = [FloorInline]


@admin.register(Floor)
class FloorAdmin(admin.ModelAdmin):
    list_display = ("name", "building", "level", "sort_order")
    list_filter = ("building",)
    search_fields = ("name", "building__name")
    inlines = [RoomInline]


@admin.register(FloorPlan)
class FloorPlanAdmin(admin.ModelAdmin):
    list_display = ("floor", "width", "height")
    search_fields = ("floor__name", "floor__building__name")
    inlines = [FloorPlanPinInline, LightLevelReadingInline]


@admin.register(FloorPlanPin)
class FloorPlanPinAdmin(admin.ModelAdmin):
    list_display = ("label", "floor_plan", "room", "x", "y")
    search_fields = ("label", "room__name")


@admin.register(LightLevelReading)
class LightLevelReadingAdmin(admin.ModelAdmin):
    list_display = ("floor_plan", "footcandles", "measured_at", "x", "y")
    list_filter = ("measured_at",)


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "floor", "room_type", "square_feet", "ceiling_type")
    list_filter = ("room_type", "ceiling_type", "floor__building")
    search_fields = ("name", "floor__name", "floor__building__name")
    inlines = [LogEntryInline, RoomPhotoInline, RoomNoteInline]


@admin.register(RoomPhoto)
class RoomPhotoAdmin(admin.ModelAdmin):
    list_display = ("room", "caption", "created")
    search_fields = ("room__name", "caption")


@admin.register(RoomNote)
class RoomNoteAdmin(admin.ModelAdmin):
    list_display = ("room", "created")
    search_fields = ("room__name", "text")


@admin.register(LogEntry)
class LogEntryAdmin(admin.ModelAdmin):
    list_display = (
        "fixture_id",
        "room",
        "qty",
        "wattage",
        "mount_type",
        "switch_type",
        "location",
    )
    list_filter = (
        "location",
        "mount_type",
        "switch_type",
        "flag_embb",
        "flag_integral_sensor",
        "flag_wet_location",
    )
    search_fields = ("fixture_id", "description", "room__name", "facility")
    inlines = [SpecItemInline]
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "room",
                    "location",
                    "fixture_id",
                    "description",
                    "qty",
                    "wattage",
                    "mount_height",
                ),
            },
        ),
        (
            "Location info",
            {
                "fields": ("facility", "floor", "space_zone"),
            },
        ),
        (
            "Controls",
            {
                "fields": (
                    "switch_type",
                    "controls",
                    "ctrl_hours",
                    "mount_type",
                    "optic",
                ),
            },
        ),
        (
            "Interior flags",
            {
                "fields": (
                    "flag_integral_sensor",
                    "flag_embb",
                    "flag_air_return",
                    "flag_wire_guard",
                    "flag_volt_480",
                    "flag_em_gen",
                ),
            },
        ),
        (
            "Exterior flags",
            {
                "fields": (
                    "flag_photocell",
                    "flag_twistlock_pc",
                    "flag_wet_location",
                    "flag_dark_sky",
                ),
            },
        ),
        ("Notes", {"fields": ("notes",)}),
    )


@admin.register(CatalogProduct)
class CatalogProductAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "family", "dlc_listed", "demand_response")
    list_filter = ("family", "dlc_listed", "demand_response")
    search_fields = ("sku", "name", "family")


@admin.register(CatalogModifier)
class CatalogModifierAdmin(admin.ModelAdmin):
    list_display = ("family", "suffix_code", "description", "sort_order")
    list_filter = ("family",)
    search_fields = ("family", "suffix_code", "description")


@admin.register(ProductAccessory)
class ProductAccessoryAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "base_family", "accessory_type")
    list_filter = ("accessory_type", "base_family")
    search_fields = ("sku", "name", "base_family")


@admin.register(SpecItem)
class SpecItemAdmin(admin.ModelAdmin):
    list_display = (
        "log_entry",
        "product",
        "category",
        "model_string",
        "qty",
        "wattage",
    )
    list_filter = ("category",)
    search_fields = ("model_string", "product__sku", "log_entry__fixture_id")
