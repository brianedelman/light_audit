import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db.models import ProtectedError

from light_audit.audit.models import AuditVersion
from light_audit.audit.models import Building
from light_audit.audit.models import Project

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
