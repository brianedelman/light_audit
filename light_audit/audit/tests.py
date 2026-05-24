import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import ProtectedError

from light_audit.audit.models import AuditVersion
from light_audit.audit.models import Building
from light_audit.audit.models import Floor
from light_audit.audit.models import KnowledgeDoc
from light_audit.audit.models import LogEntry
from light_audit.audit.models import Photo
from light_audit.audit.models import Project
from light_audit.audit.models import Room

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="test@example.com",
        password="testpass123",  # noqa: S106
    )


@pytest.fixture
def project(db, user):
    return Project.objects.create(name="Test Project", client="Test Client", owner=user)


@pytest.fixture
def building(db, project):
    return Building.objects.create(name="Test Building", project=project)


@pytest.mark.django_db
class TestAuditVersionAutoIncrement:
    def test_first_version_gets_number_1(self, building):
        v = AuditVersion.objects.create(building=building)
        assert v.version_number == 1

    def test_sequential_versions(self, building):
        v1 = AuditVersion.objects.create(building=building)
        v2 = AuditVersion.objects.create(building=building)
        v3 = AuditVersion.objects.create(building=building)
        assert (v1.version_number, v2.version_number, v3.version_number) == (1, 2, 3)

    def test_versions_independent_per_building(self, project, building):
        other_building = Building.objects.create(name="Other Building", project=project)
        AuditVersion.objects.create(building=building)
        AuditVersion.objects.create(building=building)
        v_other = AuditVersion.objects.create(building=other_building)
        assert v_other.version_number == 1

    def test_version_number_continues_after_deletion(self, building):
        AuditVersion.objects.create(building=building)
        v2 = AuditVersion.objects.create(building=building)
        v2.delete()
        v3 = AuditVersion.objects.create(building=building)
        # max-based: after deleting v2, max is 1 so next is 2
        assert v3.version_number == 2  # noqa: PLR2004

    def test_cascade_delete_building_protected(self, building):
        AuditVersion.objects.create(building=building)
        with pytest.raises(ProtectedError):
            building.delete()

    def test_unique_together_enforced(self, building):
        AuditVersion.objects.create(building=building)
        with pytest.raises(IntegrityError):
            AuditVersion.objects.create(building=building, version_number=1)

    def test_version_number_not_changed_on_update(self, building):
        v = AuditVersion.objects.create(building=building)
        assert v.version_number == 1
        v.label = "Updated"
        v.save()
        v.refresh_from_db()
        assert v.version_number == 1


@pytest.fixture
def published_version(db, building, user):
    v = AuditVersion.objects.create(
        building=building, created_by=user, status="published",
    )
    return v


@pytest.fixture
def draft_version(db, building, user):
    v = AuditVersion.objects.create(building=building, created_by=user, status="draft")
    return v


@pytest.mark.django_db
class TestPublishedVersionImmutability:
    def test_published_version_clean_raises(self, published_version):
        published_version.label = "Changed"
        with pytest.raises(
            ValidationError, match="Published audit versions cannot be modified",
        ):
            published_version.clean()

    def test_draft_version_clean_allows(self, draft_version):
        draft_version.label = "Changed"
        draft_version.clean()  # should not raise

    def test_floor_save_rejects_when_published(self, building, published_version):
        floor = Floor.objects.create(
            building=building, name="Floor 1", audit_version=published_version,
        )
        floor.name = "Renamed"
        with pytest.raises(ValidationError, match="Cannot modify floor"):
            floor.save()

    def test_floor_save_allows_when_draft(self, building, draft_version):
        floor = Floor.objects.create(
            building=building, name="Floor 1", audit_version=draft_version,
        )
        floor.name = "Renamed"
        floor.save()  # should not raise
        floor.refresh_from_db()
        assert floor.name == "Renamed"

    def test_room_save_rejects_when_published(self, building, published_version):
        floor = Floor.objects.create(
            building=building, name="Floor 1", audit_version=published_version,
        )
        room = Room.objects.create(
            floor=floor, name="Room 1", audit_version=published_version,
        )
        room.name = "Renamed"
        with pytest.raises(ValidationError, match="Cannot modify room"):
            room.save()

    def test_room_save_allows_when_draft(self, building, draft_version):
        floor = Floor.objects.create(
            building=building, name="Floor 1", audit_version=draft_version,
        )
        room = Room.objects.create(
            floor=floor, name="Room 1", audit_version=draft_version,
        )
        room.name = "Renamed"
        room.save()  # should not raise

    def test_log_entry_save_rejects_when_published(self, building, published_version):
        floor = Floor.objects.create(
            building=building, name="Floor 1", audit_version=published_version,
        )
        room = Room.objects.create(
            floor=floor, name="Room 1", audit_version=published_version,
        )
        entry = LogEntry.objects.create(
            room=room, fixture_id="E1", audit_version=published_version,
        )
        entry.notes = "Updated"
        with pytest.raises(ValidationError, match="Cannot modify log entry"):
            entry.save()

    def test_log_entry_save_allows_when_draft(self, building, draft_version):
        floor = Floor.objects.create(
            building=building, name="Floor 1", audit_version=draft_version,
        )
        room = Room.objects.create(
            floor=floor, name="Room 1", audit_version=draft_version,
        )
        entry = LogEntry.objects.create(
            room=room, fixture_id="E1", audit_version=draft_version,
        )
        entry.notes = "Updated"
        entry.save()  # should not raise

    def test_floor_without_version_allows_save(self, building):
        floor = Floor.objects.create(building=building, name="Floor 1")
        floor.name = "Renamed"
        floor.save()  # no audit_version, should not raise


@pytest.mark.django_db
class TestKnowledgeDoc:
    def test_create_knowledge_doc(self):
        doc = KnowledgeDoc.objects.create(
            title="Test Document",
            source_path="/docs/test.pdf",
            chunk_text="This is a test chunk of text.",
        )
        assert doc.pk is not None
        assert doc.title == "Test Document"
        assert doc.source_path == "/docs/test.pdf"
        assert doc.chunk_text == "This is a test chunk of text."
        assert doc.embedding is None
        assert str(doc) == "Test Document"

    def test_create_knowledge_doc_with_embedding(self):
        embedding = [0.1] * 1536
        doc = KnowledgeDoc.objects.create(
            title="Embedded Doc",
            chunk_text="Text with embedding.",
            embedding=embedding,
        )
        retrieved = KnowledgeDoc.objects.get(pk=doc.pk)
        assert retrieved.embedding is not None
        assert len(retrieved.embedding) == 1536  # noqa: PLR2004

    def test_retrieve_knowledge_doc(self):
        doc = KnowledgeDoc.objects.create(
            title="Retrieve Test",
            source_path="/docs/retrieve.pdf",
            chunk_text="Retrievable text.",
        )
        retrieved = KnowledgeDoc.objects.get(pk=doc.pk)
        assert retrieved.title == "Retrieve Test"
        assert retrieved.chunk_text == "Retrievable text."


@pytest.mark.django_db
class TestPhoto:
    def test_create_photo_minimal(self, building):
        photo = Photo.objects.create(
            building=building,
            photo_type="fixture",
        )
        assert photo.pk is not None
        assert photo.building == building
        assert photo.photo_type == "fixture"
        assert photo.floor is None
        assert photo.room is None
        assert photo.log_entry is None
        assert str(photo) == f"fixture - {building.name}"

    def test_photo_with_all_fks(self, building, user, draft_version):
        floor = Floor.objects.create(
            building=building, name="Floor 1", audit_version=draft_version,
        )
        room = Room.objects.create(
            floor=floor, name="Room 1", audit_version=draft_version,
        )
        entry = LogEntry.objects.create(
            room=room, fixture_id="E1", audit_version=draft_version,
        )
        photo = Photo.objects.create(
            building=building,
            floor=floor,
            room=room,
            log_entry=entry,
            user=user,
            photo_type="switch",
            space_name="Lobby",
            storage_path="photos/test.jpg",
            public_url="https://example.com/test.jpg",
            file_size_bytes=1024000,
            mime_type="image/jpeg",
            width=1920,
            height=1080,
            notes="Test photo",
        )
        assert photo.building == building
        assert photo.floor == floor
        assert photo.room == room
        assert photo.log_entry == entry
        assert photo.user == user
        assert photo.space_name == "Lobby"

    def test_photo_fk_cascade_on_building_delete(self, project):
        b = Building.objects.create(name="Temp Building", project=project)
        Photo.objects.create(building=b, photo_type="panorama")
        bid = b.pk
        assert Photo.objects.filter(building_id=bid).count() == 1
        b.delete()
        assert Photo.objects.filter(building_id=bid).count() == 0

    def test_photo_set_null_on_room_delete(self, building, draft_version):
        floor = Floor.objects.create(
            building=building, name="Floor 1", audit_version=draft_version,
        )
        room = Room.objects.create(
            floor=floor, name="Room 1", audit_version=draft_version,
        )
        photo = Photo.objects.create(
            building=building, room=room, photo_type="controls",
        )
        room.delete()
        photo.refresh_from_db()
        assert photo.room is None

    def test_photo_set_null_on_log_entry_delete(self, building, draft_version):
        floor = Floor.objects.create(
            building=building, name="Floor 1", audit_version=draft_version,
        )
        room = Room.objects.create(
            floor=floor, name="Room 1", audit_version=draft_version,
        )
        entry = LogEntry.objects.create(
            room=room, fixture_id="E1", audit_version=draft_version,
        )
        photo = Photo.objects.create(
            building=building, log_entry=entry, photo_type="fixture",
        )
        entry.delete()
        photo.refresh_from_db()
        assert photo.log_entry is None

    def test_photo_type_choices(self, building):
        for ptype in ["fixture", "switch", "controls", "panorama", "video"]:
            photo = Photo.objects.create(building=building, photo_type=ptype)
            assert photo.photo_type == ptype
