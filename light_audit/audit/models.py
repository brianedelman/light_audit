from django.db import models


class Building(models.Model):
    PROJECT_TYPES = [
        ("normal", "Normal"),
        ("nycecc", "NYC ECC"),
        ("ashrae", "ASHRAE 90.1"),
    ]

    BUILDING_TYPES = [
        ("k12", "K-12"),
        ("higher_ed", "Higher Ed"),
        ("office", "Office"),
        ("municipal", "Municipal"),
        ("healthcare", "Healthcare"),
        ("retail", "Retail"),
        ("industrial", "Industrial"),
        ("warehouse", "Warehouse"),
        ("residential", "Residential"),
        ("mixed_use", "Mixed Use"),
        ("other", "Other"),
    ]

    name = models.CharField(max_length=255)
    address = models.CharField(max_length=500, blank=True)
    client = models.CharField(max_length=255, blank=True)
    auditor = models.CharField(max_length=255, blank=True)
    project_type = models.CharField(max_length=20, choices=PROJECT_TYPES, default="normal")
    building_type = models.CharField(max_length=30, choices=BUILDING_TYPES, blank=True)
    square_feet = models.PositiveIntegerField(null=True, blank=True)
    year_built = models.PositiveIntegerField(null=True, blank=True)
    hvac_type = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=2, blank=True)
    utility = models.CharField(max_length=255, blank=True)
    egrid_subregion = models.CharField(max_length=50, blank=True)
    climate_zone = models.CharField(max_length=20, blank=True)
    savings_model = models.CharField(max_length=100, blank=True)
    baseline_hours = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    emergency_lighting_strategy = models.CharField(max_length=100, blank=True)
    room_type_hours_overrides = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Floor(models.Model):
    building = models.ForeignKey(Building, on_delete=models.CASCADE, related_name="floors")
    name = models.CharField(max_length=100)
    level = models.IntegerField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "level"]

    def __str__(self):
        return f"{self.building.name} / {self.name}"


class FloorPlan(models.Model):
    floor = models.OneToOneField(Floor, on_delete=models.CASCADE, related_name="floor_plan")
    pdf = models.FileField(upload_to="floor_plans/", null=True, blank=True)
    image = models.ImageField(upload_to="floor_plans/", null=True, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)

    def __str__(self):
        return f"FloorPlan {self.floor}"


class FloorPlanPin(models.Model):
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


class LightLevelReading(models.Model):
    MEASURED_AT = [
        ("floor", "Floor"),
        ("30aff", '30" AFF'),
        ("surface", "Surface"),
    ]
    floor_plan = models.ForeignKey(FloorPlan, on_delete=models.CASCADE, related_name="light_levels")
    x = models.FloatField()
    y = models.FloatField()
    footcandles = models.DecimalField(max_digits=8, decimal_places=2)
    measured_at = models.CharField(max_length=20, choices=MEASURED_AT, default="floor")


class Room(models.Model):
    floor = models.ForeignKey(Floor, on_delete=models.CASCADE, related_name="rooms")
    name = models.CharField(max_length=255)
    room_type = models.CharField(max_length=100, blank=True)
    zone_label = models.CharField(max_length=100, blank=True)
    pin_code = models.CharField(max_length=50, blank=True)
    dimensions = models.CharField(max_length=100, blank=True)
    square_feet = models.PositiveIntegerField(null=True, blank=True)
    mount_height = models.CharField(max_length=50, blank=True)
    ceiling_type = models.CharField(max_length=100, blank=True)
    hours_override = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    # wiring flags
    wiring_three_way = models.BooleanField(default=False)
    wiring_ab_switching = models.BooleanField(default=False)
    wiring_no_neutral = models.BooleanField(default=False)

    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.floor} / {self.name}"


class RoomPhoto(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="photos")
    file = models.FileField(upload_to="room_photos/")
    caption = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class RoomNote(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="room_notes")
    text = models.TextField(blank=True)
    voice_memo = models.FileField(upload_to="voice_memos/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class LogEntry(models.Model):
    SWITCH_TYPES = [
        ("toggle", "Toggle"),
        ("wireless", "Wireless Switch"),
        ("keyed", "Keyed Switch"),
        ("rocker", "Rocker"),
        ("scene", "Scene Selector/Keypad"),
        ("dimmer", "Dimmer"),
        ("sensor_switch", "Sensor Switch"),
        ("low_voltage", "Low Voltage"),
        ("none", "None"),
    ]

    MOUNT_TYPES = [
        # interior
        ("surface", "Surface"),
        ("wall", "Wall"),
        ("pendant", "Pendant"),
        ("threaded_rod", "Threaded Rod"),
        ("chain", "Chain"),
        ("aircraft_cable", "Aircraft Cable"),
        ("kindorf", "Kindorf"),
        ("recessed", "Recessed"),
        # exterior
        ("knuckle", "Knuckle"),
        ("trunnion", "Trunnion"),
        ("bracket", "Bracket"),
        ("slipfitter", "Slipfitter"),
        ("tenon", "Tenon"),
        ("wall_mount", "Wall-Mount"),
        ("pole_mount", "Pole-Mount"),
    ]

    OPTIC_TYPES = [
        ("type_ii", "Type II"),
        ("type_iii", "Type III"),
        ("type_iv", "Type IV"),
        ("type_v", "Type V"),
    ]

    LOCATION = [
        ("interior", "Interior"),
        ("exterior", "Exterior"),
    ]

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="log_entries")
    location = models.CharField(max_length=20, choices=LOCATION, default="interior")

    facility = models.CharField(max_length=255, blank=True)
    floor = models.CharField(max_length=100, blank=True)
    space_zone = models.CharField(max_length=255, blank=True)
    fixture_id = models.CharField(max_length=20, blank=True)  # custom code "E1", "X2"
    description = models.CharField(max_length=255, blank=True)
    qty = models.PositiveIntegerField(default=1)
    wattage = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    mount_height = models.CharField(max_length=50, blank=True)

    switch_type = models.CharField(max_length=30, choices=SWITCH_TYPES, blank=True)
    controls = models.CharField(max_length=255, blank=True)
    mount_type = models.CharField(max_length=30, choices=MOUNT_TYPES, blank=True)
    optic = models.CharField(max_length=20, choices=OPTIC_TYPES, blank=True)

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

    ctrl_hours = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Log entries"

    def __str__(self):
        return f"{self.fixture_id or 'entry'} x{self.qty}"


class CatalogProduct(models.Model):
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


class CatalogModifier(models.Model):
    family = models.CharField(max_length=100)
    suffix_code = models.CharField(max_length=20)
    description = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["family", "sort_order"]
        unique_together = [("family", "suffix_code")]

    def __str__(self):
        return f"{self.family}{self.suffix_code}"


class ProductAccessory(models.Model):
    ACCESSORY_TYPES = [
        ("goof_ring", "Goof Ring"),
        ("trim", "Trim"),
        ("mounting_plate", "Mounting Plate"),
        ("socket_kit", "Socket Kit"),
        ("other", "Other"),
    ]
    base_family = models.CharField(max_length=100)
    sku = models.CharField(max_length=100)
    name = models.CharField(max_length=255)
    accessory_type = models.CharField(max_length=30, choices=ACCESSORY_TYPES, blank=True)
    image_url = models.URLField(blank=True)
    spec_sheet_url = models.URLField(blank=True)

    class Meta:
        verbose_name_plural = "Product accessories"

    def __str__(self):
        return f"{self.sku} ({self.accessory_type})"


class SpecItem(models.Model):
    REPLACEMENT_CATEGORIES = [
        ("relamp", "Re-lamp"),
        ("kit", "Kit"),
        ("new_fixture", "New Fixture"),
        ("custom", "Custom"),
        ("switch", "Switch/Control"),
    ]

    log_entry = models.ForeignKey(LogEntry, on_delete=models.CASCADE, related_name="spec_items")
    product = models.ForeignKey(CatalogProduct, on_delete=models.PROTECT, null=True, blank=True)
    category = models.CharField(max_length=20, choices=REPLACEMENT_CATEGORIES, blank=True)
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
        return self.model_string or (self.product.sku if self.product else f"spec {self.pk}")
