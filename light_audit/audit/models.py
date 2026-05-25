from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django_extensions.db.models import TimeStampedModel
from pgvector.django import VectorField


class ProjectType(models.TextChoices):
    NORMAL = "normal", "Normal"
    NYCECC = "nycecc", "NYC ECC"
    ASHRAE = "ashrae", "ASHRAE 90.1"


class BuildingType(models.TextChoices):
    K12 = "k12", "K-12"
    HIGHER_ED = "higher_ed", "Higher Ed"
    OFFICE = "office", "Office"
    MUNICIPAL = "municipal", "Municipal"
    HEALTHCARE = "healthcare", "HealthCare"
    RETAIL = "retail", "Retail"
    INDUSTRIAL = "industrial", "Industrial"
    WAREHOUSE = "warehouse", "Warehouse"
    RESIDENTIAL = "residential", "Residential"
    MIXED_USE = "mixed_use", "Mixed Use"
    OTHER = "other", "Other"


class ProjectStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETE = "complete", "Complete"
    ABANDONED = "abandoned", "Abandoned"


class Project(TimeStampedModel):
    name = models.CharField(max_length=150)
    client = models.CharField(max_length=255, blank=True)
    project_type = models.CharField(
        max_length=20, choices=ProjectType.choices, default="normal"
    )
    status = models.CharField(
        max_length=20,
        choices=ProjectStatus.choices,
        default=ProjectStatus.PENDING.value,
    )
    owner = models.ForeignKey(
        related_name="projects",
        to=settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )


class Building(TimeStampedModel):
    project = models.ForeignKey(
        to=Project,
        on_delete=models.PROTECT,
        related_name="buildings",
    )
    client_uuid = models.UUIDField(null=True, blank=True, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=500, blank=True)
    auditor = models.CharField(max_length=255, blank=True)
    building_type = models.CharField(
        max_length=30, choices=BuildingType.choices, blank=True
    )
    square_feet = models.PositiveIntegerField(null=True, blank=True)
    year_built = models.PositiveIntegerField(null=True, blank=True)
    hvac_type = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=2, blank=True)
    utility = models.CharField(max_length=255, blank=True)
    egrid_subregion = models.CharField(max_length=50, blank=True)
    climate_zone = models.CharField(max_length=20, blank=True)
    savings_model = models.CharField(max_length=100, blank=True)
    baseline_hours = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    emergency_lighting_strategy = models.CharField(max_length=100, blank=True)
    room_type_hours_overrides = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.name


class AuditVersionStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"
    PUBLISHED_TO_IPAD = "published_to_ipad", "Published To Ipad"


class AuditVersion(TimeStampedModel):
    building = models.ForeignKey(
        Building, related_name="audit_versions", on_delete=models.PROTECT
    )
    version_number = models.PositiveIntegerField(editable=False)
    label = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    status = models.CharField(
        max_length=30,
        choices=AuditVersionStatus.choices,
        default=AuditVersionStatus.DRAFT.value,
    )
    source_payload = models.JSONField(default=dict, blank=True)
    is_current = models.BooleanField(default=True)
    client_uuid = models.UUIDField(null=True, blank=True, unique=True, db_index=True)

    class Meta:
        ordering = ["-version_number"]
        unique_together = [("building", "version_number")]

    def __str__(self):
        return f"{self.building.name} v{self.version_number}"

    def clean(self):
        if not self._state.adding and self.pk:
            existing = (
                AuditVersion.objects.filter(pk=self.pk)
                .values_list("status", flat=True)
                .first()
            )
            if existing == AuditVersionStatus.PUBLISHED:
                msg = "Published audit versions cannot be modified."
                raise ValidationError(msg)

    def save(self, *args, **kwargs):
        if self._state.adding and not self.version_number:
            last = (
                AuditVersion.objects.filter(building=self.building)
                .order_by("-version_number")
                .values_list("version_number", flat=True)
                .first()
            )
            self.version_number = (last or 0) + 1
        super().save(*args, **kwargs)


class Floor(TimeStampedModel):
    building = models.ForeignKey(
        Building, on_delete=models.CASCADE, related_name="floors"
    )
    name = models.CharField(max_length=100)
    level = models.IntegerField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    audit_version = models.ForeignKey(
        AuditVersion, on_delete=models.SET_NULL, null=True
    )

    class Meta:
        ordering = ["sort_order", "level"]

    def __str__(self):
        return f"{self.building.name} / {self.name}"

    def save(self, *args, **kwargs):
        if not self._state.adding and self.audit_version_id:
            status = (
                AuditVersion.objects.filter(pk=self.audit_version_id)
                .values_list("status", flat=True)
                .first()
            )
            if status == AuditVersionStatus.PUBLISHED:
                msg = "Cannot modify floor linked to a published audit version."
                raise ValidationError(msg)
        super().save(*args, **kwargs)


class FloorPlan(TimeStampedModel):
    floor = models.OneToOneField(
        Floor, on_delete=models.CASCADE, related_name="floor_plan"
    )
    pdf = models.FileField(upload_to="floor_plans/", null=True, blank=True)
    image = models.ImageField(upload_to="floor_plans/", null=True, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)

    def __str__(self):
        return f"FloorPlan {self.floor}"


class FloorPlanPin(TimeStampedModel):
    floor_plan = models.ForeignKey(
        FloorPlan,
        on_delete=models.CASCADE,
        related_name="pins",
    )
    room = models.ForeignKey(
        "Room",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pins",
    )
    label = models.CharField(max_length=50, blank=True)
    x = models.FloatField()
    y = models.FloatField()
    polygon = models.JSONField(default=list, blank=True)

    def __str__(self):
        return self.label or f"Pin {self.pk}"


class LightLevelReading(TimeStampedModel):
    MEASURED_AT = [
        ("floor", "Floor"),
        ("30aff", '30" AFF'),
        ("surface", "Surface"),
    ]
    floor_plan = models.ForeignKey(
        FloorPlan, on_delete=models.CASCADE, related_name="light_levels"
    )
    x = models.FloatField()
    y = models.FloatField()
    footcandles = models.DecimalField(max_digits=8, decimal_places=2)
    measured_at = models.CharField(max_length=20, choices=MEASURED_AT, default="floor")


class Room(TimeStampedModel):
    floor = models.ForeignKey(Floor, on_delete=models.CASCADE, related_name="rooms")
    name = models.CharField(max_length=255)
    room_type = models.CharField(max_length=100, blank=True)
    zone_label = models.CharField(max_length=100, blank=True)
    pin_code = models.CharField(max_length=50, blank=True)
    dimensions = models.CharField(max_length=100, blank=True)
    square_feet = models.PositiveIntegerField(null=True, blank=True)
    mount_height = models.CharField(max_length=50, blank=True)
    ceiling_type = models.CharField(max_length=100, blank=True)
    hours_override = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )

    # wiring flags
    wiring_three_way = models.BooleanField(default=False)
    wiring_ab_switching = models.BooleanField(default=False)
    wiring_no_neutral = models.BooleanField(default=False)

    notes = models.TextField(blank=True)
    audit_version = models.ForeignKey(
        AuditVersion, on_delete=models.SET_NULL, null=True
    )

    def __str__(self):
        return f"{self.floor} / {self.name}"

    def save(self, *args, **kwargs):
        if not self._state.adding and self.audit_version_id:
            status = (
                AuditVersion.objects.filter(pk=self.audit_version_id)
                .values_list("status", flat=True)
                .first()
            )
            if status == AuditVersionStatus.PUBLISHED:
                msg = "Cannot modify room linked to a published audit version."
                raise ValidationError(msg)
        super().save(*args, **kwargs)


class RoomPhoto(TimeStampedModel):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="photos")
    file = models.FileField(upload_to="room_photos/")
    caption = models.CharField(max_length=255, blank=True)


class RoomNote(TimeStampedModel):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="room_notes")
    text = models.TextField(blank=True)
    voice_memo = models.FileField(upload_to="voice_memos/", null=True, blank=True)


class SwitchType(models.TextChoices):
    TOGGLE = "toggle", "Toggle"
    WIRELESS = "wireless", "Wireless Switch"
    KEYED = "keyed", "Keyed Switch"
    ROCKER = "rocker", "Rocker"
    SCENE = "scene", "Scene Selector/Keypad"
    DIMMER = "dimmer", "Dimmer"
    SENSOR_SWITCH = "sensor_switch", "Sensor Switch"
    LOW_VOLTAGE = "low_voltage", "Low Voltage"
    NONE = "none", "None"


class MountType(models.TextChoices):
    SURFACE = "surface", "Surface"
    WALL = "wall", "Wall"
    PENDANT = "pendant", "Pendant"
    THREADED_ROD = "threaded_rod", "Threaded Rod"
    CHAIN = "chain", "Chain"
    AIRCRAFT_CABLE = "aircraft_cable", "Aircraft Cable"
    KINDORF = "kindorf", "Kindorf"
    RECESSED = "recessed", "Recessed"
    # exterior
    KNUCKLE = "knuckle", "Knuckle"
    TRUNNION = "trunnion", "Trunnion"
    BRACKET = "bracket", "Bracket"
    SLIP_FITTER = "slipfitter", "Slipfitter"
    TENNON = "tenon", "Tenon"
    WALL_MOUNT = "wall_mount", "Wall-Mount"
    POLE_MOUNT = "pole_mount", "Pole-Mount"


class OpticType(models.TextChoices):
    TYPE_II = "type_ii", "Type II"
    TYPE_III = "type_iii", "Type III"
    TYPE_IV = "type_iv", "Type IV"
    TYPE_V = "type_v", "Type V"


class Location(models.TextChoices):
    INTERIOR = "interior", "Interior"
    EXTERIOR = "exterior", "Exterior"


class LogEntry(TimeStampedModel):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="log_entries")
    location = models.CharField(
        max_length=20, choices=Location.choices, default="interior"
    )

    facility = models.CharField(max_length=255, blank=True)
    floor = models.CharField(max_length=100, blank=True)
    space_zone = models.CharField(max_length=255, blank=True)
    fixture_id = models.CharField(max_length=20, blank=True)  # custom code "E1", "X2"
    description = models.CharField(max_length=255, blank=True)
    qty = models.PositiveIntegerField(default=1)
    wattage = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    mount_height = models.CharField(max_length=50, blank=True)

    switch_type = models.CharField(
        max_length=30, choices=SwitchType.choices, blank=True
    )
    controls = models.CharField(max_length=255, blank=True)
    mount_type = models.CharField(max_length=30, choices=MountType.choices, blank=True)
    optic = models.CharField(max_length=20, choices=OpticType.choices, blank=True)

    # interior flags
    flag_integral_sensor = models.BooleanField(default=False)
    flag_embb = models.BooleanField(default=False)
    flag_air_return = models.BooleanField(default=False)
    flag_wire_guard = models.BooleanField(default=False)
    flag_volt_480 = models.BooleanField(default=False)
    flag_em_gen = models.BooleanField(default=False)

    # exterior flags
    flag_photocell = models.BooleanField(default=False)
    flag_twistlock_pc = models.BooleanField(default=False)
    flag_wet_location = models.BooleanField(default=False)
    flag_dark_sky = models.BooleanField(default=False)

    ctrl_hours = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    notes = models.TextField(blank=True)

    audit_version = models.ForeignKey(
        AuditVersion, on_delete=models.SET_NULL, null=True
    )

    class Meta:
        verbose_name_plural = "Log entries"

    def __str__(self):
        return f"{self.fixture_id or 'entry'} x{self.qty}"

    def save(self, *args, **kwargs):
        if not self._state.adding and self.audit_version_id:
            status = (
                AuditVersion.objects.filter(pk=self.audit_version_id)
                .values_list("status", flat=True)
                .first()
            )
            if status == AuditVersionStatus.PUBLISHED:
                msg = "Cannot modify log entry linked to a published audit version."
                raise ValidationError(msg)
        super().save(*args, **kwargs)


class CatalogProduct(TimeStampedModel):
    sku = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)
    family = models.CharField(max_length=100, blank=True)
    wattage_options = models.JSONField(default=list, blank=True)
    cct_options = models.JSONField(default=list, blank=True)
    dlc_listed = models.BooleanField(default=False)
    em_options = models.JSONField(default=list, blank=True)
    demand_response = models.BooleanField(default=False)
    dimming_range = models.CharField(max_length=50, blank=True)
    image_url = models.URLField(blank=True)
    spec_sheet_url = models.URLField(blank=True)

    def __str__(self):
        return self.sku


class CatalogModifier(TimeStampedModel):
    family = models.CharField(max_length=100)
    suffix_code = models.CharField(max_length=20)
    description = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["family", "sort_order"]
        unique_together = [("family", "suffix_code")]

    def __str__(self):
        return f"{self.family}{self.suffix_code}"


class AccessoryType(models.TextChoices):
    GOOF_RING = "goof_ring", "Goof Ring"
    TRIM = "trim", "Trim"
    MOUNTING_PLATE = "mounting_plate", "Mounting Plate"
    SOCKET_KIT = "socket_kit", "Socket Kit"
    OTHER = "other", "Other"


class ProductAccessory(TimeStampedModel):
    base_family = models.CharField(max_length=100)
    sku = models.CharField(max_length=100)
    name = models.CharField(max_length=255)
    accessory_type = models.CharField(
        max_length=30, choices=AccessoryType.choices, blank=True
    )
    image_url = models.URLField(blank=True)
    spec_sheet_url = models.URLField(blank=True)

    class Meta:
        verbose_name_plural = "Product accessories"

    def __str__(self):
        return f"{self.sku} ({self.accessory_type})"


class ReplacementCategories(models.TextChoices):
    RELAMP = "relamp", "Re-lamp"
    KIT = "kit", "Kit"
    NEW_FIXTURE = "new_fixture", "New Fixture"
    CUSTOM = "custom", "Custom"
    SWITCH = "switch", "Switch/Control"


class SpecItem(TimeStampedModel):
    log_entry = models.ForeignKey(
        LogEntry, on_delete=models.CASCADE, related_name="spec_items"
    )
    product = models.ForeignKey(
        CatalogProduct, on_delete=models.PROTECT, null=True, blank=True
    )
    category = models.CharField(
        max_length=20, choices=ReplacementCategories.choices, blank=True
    )
    model_string = models.CharField(max_length=255, blank=True)
    qty = models.PositiveIntegerField(default=1)
    wattage = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    cct = models.CharField(max_length=20, blank=True)
    switch_recommendation = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order"]

    def __str__(self):
        return self.model_string or (
            self.product.sku if self.product else f"spec {self.pk}"
        )


class PhotoType(models.TextChoices):
    FIXTURE = "fixture", "Fixture"
    SWITCH = "switch", "Switch"
    CONTROLS = "controls", "Controls"
    PANORAMA = "panorama", "Panorama"
    VIDEO = "video", "Video"


class PhotoUploadStatus(models.TextChoices):
    UPLOADING = "uploading", "Uploading"
    UPLOADED = "uploaded", "Uploaded"
    FAILED = "failed", "Failed"


class Photo(TimeStampedModel):
    building = models.ForeignKey(
        Building, on_delete=models.CASCADE, related_name="photos"
    )
    floor = models.ForeignKey(
        Floor, on_delete=models.SET_NULL, null=True, blank=True, related_name="photos"
    )
    room = models.ForeignKey(
        Room, on_delete=models.SET_NULL, null=True, blank=True, related_name="media"
    )
    space_name = models.CharField(max_length=255, blank=True)
    photo_type = models.CharField(
        max_length=20, choices=PhotoType.choices, default=PhotoType.FIXTURE
    )
    storage_path = models.CharField(max_length=500, blank=True)
    public_url = models.URLField(blank=True)
    thumbnail_url = models.URLField(blank=True)
    file_size_bytes = models.PositiveBigIntegerField(null=True, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    duration_seconds = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    taken_at = models.DateTimeField(null=True, blank=True)
    uploaded_at = models.DateTimeField(null=True, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="photos",
    )
    log_entry = models.ForeignKey(
        LogEntry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="photos",
    )
    notes = models.TextField(blank=True)
    upload_status = models.CharField(
        max_length=20, choices=PhotoUploadStatus.choices, blank=True, default=""
    )
    r2_upload_id = models.CharField(max_length=500, blank=True)

    def __str__(self):
        return f"{self.photo_type} - {self.building.name}"


class FlagSeverity(models.TextChoices):
    INFO = "info", "Info"
    WARN = "warn", "Warning"
    CRITICAL = "critical", "Critical"


class FlagStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    DISMISSED = "dismissed", "Dismissed"


class AuditFlag(TimeStampedModel):
    log_entry = models.ForeignKey(
        LogEntry,
        on_delete=models.CASCADE,
        related_name="audit_flags",
    )
    audit_version = models.ForeignKey(
        AuditVersion,
        on_delete=models.CASCADE,
        related_name="audit_flags",
    )
    severity = models.CharField(
        max_length=10,
        choices=FlagSeverity.choices,
        default=FlagSeverity.INFO,
    )
    message = models.TextField()
    status = models.CharField(
        max_length=10,
        choices=FlagStatus.choices,
        default=FlagStatus.ACTIVE,
    )
    dismissed_reason = models.TextField(blank=True)
    dismissed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dismissed_flags",
    )
    dismissed_at = models.DateTimeField(null=True, blank=True)
    source_run = models.ForeignKey(
        "AgentRun",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="flags",
    )

    def __str__(self):
        return f"{self.severity} flag: {self.message[:50]}"

    def dismiss(self, user, reason=""):
        self.status = FlagStatus.DISMISSED
        self.dismissed_by = user
        self.dismissed_reason = reason
        self.dismissed_at = timezone.now()
        self.save()


class AgentType(models.TextChoices):
    AUDIT_REVIEW = "audit_review", "Audit Review"
    CHATBOT = "chatbot", "Chatbot"


class AgentRunStatus(models.TextChoices):
    RUNNING = "running", "Running"
    OK = "ok", "OK"
    ERROR = "error", "Error"


class AgentRun(TimeStampedModel):
    agent_type = models.CharField(max_length=20, choices=AgentType.choices)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="agent_runs",
    )
    project = models.ForeignKey(
        "Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agent_runs",
    )
    audit_version = models.ForeignKey(
        "AuditVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agent_runs",
    )
    prompt_input = models.JSONField(default=dict, blank=True)
    response_output = models.JSONField(default=dict, blank=True)
    tokens_in = models.PositiveIntegerField(default=0)
    tokens_out = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=10,
        choices=AgentRunStatus.choices,
        default=AgentRunStatus.RUNNING,
    )
    error = models.TextField(blank=True)

    def __str__(self):
        return f"{self.agent_type} run #{self.pk} ({self.status})"

    def mark_ok(self, response, tokens_in, tokens_out):
        self.status = AgentRunStatus.OK
        self.response_output = response
        self.tokens_in = tokens_in
        self.tokens_out = tokens_out
        self.finished_at = timezone.now()
        self.save()

    def mark_error(self, error_text):
        self.status = AgentRunStatus.ERROR
        self.error = error_text
        self.finished_at = timezone.now()
        self.save()


class KnowledgeDoc(TimeStampedModel):
    title = models.CharField(max_length=255)
    source_path = models.CharField(max_length=500, blank=True)
    chunk_text = models.TextField()
    embedding = VectorField(dimensions=1536, null=True, blank=True)

    def __str__(self):
        return self.title



