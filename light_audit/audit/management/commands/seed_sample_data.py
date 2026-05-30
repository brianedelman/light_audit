from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from light_audit.audit.models import (
    AuditFlag,
    AuditVersion,
    Building,
    BuildingType,
    FlagSeverity,
    Floor,
    LogEntry,
    Project,
    ProjectStatus,
    ProjectType,
    Room,
)

User = get_user_model()


class Command(BaseCommand):
    help = "Seed sample Project / Building / AuditVersion / Floor / Room / LogEntry data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            default="demo@lightaudit.local",
            help="Owner email (creates user if missing).",
        )
        parser.add_argument(
            "--password",
            default="demo12345",
            help="Password for created demo user.",
        )
        parser.add_argument(
            "--wipe",
            action="store_true",
            help="Delete existing sample Projects (by name prefix 'Sample') first.",
        )

    @transaction.atomic
    def handle(self, *args, **opts):
        email = opts["email"]
        password = opts["password"]

        if opts["wipe"]:
            qs = Project.objects.filter(name__startswith="Sample")
            n = qs.count()
            qs.delete()
            self.stdout.write(f"Wiped {n} sample project(s).")

        user, created = User.objects.get_or_create(
            email=email, defaults={"name": "Demo User", "is_staff": True}
        )
        if created:
            user.set_password(password)
            user.save()
            self.stdout.write(self.style.SUCCESS(f"Created user {email} / {password}"))
        else:
            self.stdout.write(f"Using existing user {email}")

        project, _ = Project.objects.get_or_create(
            name="Sample — Lincoln Elementary Retrofit",
            defaults={
                "client": "Lincoln Public Schools",
                "project_type": ProjectType.NORMAL,
                "status": ProjectStatus.IN_PROGRESS,
                "owner": user,
            },
        )

        building, _ = Building.objects.get_or_create(
            project=project,
            name="Lincoln Elementary — Main",
            defaults={
                "address": "123 Main St, Springfield, IL",
                "auditor": "Demo User",
                "building_type": BuildingType.K12,
                "square_feet": 42000,
                "year_built": 1978,
                "hvac_type": "RTU",
                "state": "IL",
                "utility": "Ameren",
                "climate_zone": "5A",
                "baseline_hours": 3200,
            },
        )

        version, v_created = AuditVersion.objects.get_or_create(
            building=building,
            version_number=1,
            defaults={
                "label": "Initial walkthrough",
                "created_by": user,
                "is_current": True,
            },
        )
        if v_created:
            self.stdout.write(f"Created AuditVersion v{version.version_number}")

        floors_data = [
            ("Basement", -1, 0),
            ("First Floor", 1, 1),
            ("Second Floor", 2, 2),
        ]
        floors = {}
        for name, level, sort_order in floors_data:
            f, _ = Floor.objects.get_or_create(
                building=building,
                name=name,
                defaults={
                    "level": level,
                    "sort_order": sort_order,
                    "audit_version": version,
                },
            )
            floors[name] = f

        rooms_spec = [
            ("First Floor", "Main Office", "office", "9'", "ACT"),
            ("First Floor", "Classroom 101", "classroom", "10'", "ACT"),
            ("First Floor", "Classroom 102", "classroom", "10'", "ACT"),
            ("First Floor", "Cafeteria", "cafeteria", "14'", "open"),
            ("First Floor", "Hallway A", "corridor", "10'", "ACT"),
            ("Second Floor", "Classroom 201", "classroom", "10'", "ACT"),
            ("Second Floor", "Classroom 202", "classroom", "10'", "ACT"),
            ("Second Floor", "Library", "library", "12'", "ACT"),
            ("Basement", "Boiler Room", "mechanical", "12'", "open"),
            ("Basement", "Storage", "storage", "9'", "ACT"),
        ]
        rooms = {}
        for floor_name, rname, rtype, height, ceiling in rooms_spec:
            r, _ = Room.objects.get_or_create(
                floor=floors[floor_name],
                name=rname,
                defaults={
                    "room_type": rtype,
                    "mount_height": height,
                    "ceiling_type": ceiling,
                    "audit_version": version,
                },
            )
            rooms[rname] = r

        log_specs = [
            # room, fixture_id, desc, qty, watt, switch_type, mount, controls
            ("Main Office", "A1", "2x4 troffer", 6, 32, "toggle", "recessed", "wall switch"),
            ("Main Office", "A2", "Downlight 6\"", 4, 18, "toggle", "recessed", ""),
            ("Classroom 101", "B1", "2x4 troffer", 9, 32, "sensor_switch", "recessed", "occupancy sensor"),
            ("Classroom 101", "B2", "Whiteboard light", 1, 24, "toggle", "surface", ""),
            ("Classroom 102", "B1", "2x4 troffer", 9, 32, "sensor_switch", "recessed", "occupancy sensor"),
            ("Cafeteria", "C1", "2x2 troffer", 18, 28, "toggle", "recessed", ""),
            ("Cafeteria", "C2", "High-bay pendant", 6, 150, "toggle", "pendant", ""),
            ("Hallway A", "D1", "2x2 troffer", 12, 28, "toggle", "recessed", "24/7"),
            ("Classroom 201", "B1", "2x4 troffer", 9, 32, "sensor_switch", "recessed", "occupancy sensor"),
            ("Classroom 202", "B1", "2x4 troffer", 9, 32, "sensor_switch", "recessed", "occupancy sensor"),
            ("Library", "E1", "Linear pendant", 8, 45, "dimmer", "pendant", "dimmer"),
            ("Boiler Room", "F1", "Strip light 4'", 4, 40, "toggle", "surface", ""),
            ("Storage", "F2", "Strip light 4'", 2, 40, "toggle", "surface", ""),
        ]
        created_entries = []
        for rname, fid, desc, qty, watt, sw, mount, ctrl in log_specs:
            entry, made = LogEntry.objects.get_or_create(
                room=rooms[rname],
                fixture_id=fid,
                description=desc,
                defaults={
                    "qty": qty,
                    "wattage": watt,
                    "switch_type": sw,
                    "mount_type": mount,
                    "controls": ctrl,
                    "audit_version": version,
                },
            )
            if made:
                created_entries.append(entry)

        # A couple of sample flags
        sample_flag_targets = [e for e in created_entries if e.fixture_id == "D1"][:1]
        for e in sample_flag_targets:
            AuditFlag.objects.get_or_create(
                log_entry=e,
                audit_version=version,
                message="Hallway lighting marked 24/7 — consider occupancy sensors.",
                defaults={"severity": FlagSeverity.WARN},
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded: project={project.id} building={building.id} "
                f"version={version.id} floors={len(floors)} rooms={len(rooms)} "
                f"log_entries={LogEntry.objects.filter(audit_version=version).count()}"
            )
        )
        self.stdout.write(
            self.style.SUCCESS(f"Login: {email} / {password if created else '(existing pw)'}")
        )
