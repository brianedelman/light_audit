from http import HTTPStatus

import pytest
from django.contrib.auth import get_user_model

from light_audit.audit.models import AuditFlag
from light_audit.audit.models import AuditVersion
from light_audit.audit.models import Building
from light_audit.audit.models import FlagSeverity
from light_audit.audit.models import FlagStatus
from light_audit.audit.models import Floor
from light_audit.audit.models import LogEntry
from light_audit.audit.models import Project
from light_audit.audit.models import Room

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="flags@example.com", password="pass")  # noqa: S106


@pytest.fixture
def project(db, user):
    return Project.objects.create(name="Flags Project", owner=user)


@pytest.fixture
def building(db, project):
    return Building.objects.create(name="Flags Building", project=project)


@pytest.fixture
def audit_version(db, building, user):
    return AuditVersion.objects.create(building=building, created_by=user)


@pytest.fixture
def floor(db, building, audit_version):
    return Floor.objects.create(
        name="Floor 1", building=building, audit_version=audit_version,
    )


@pytest.fixture
def room(db, floor, audit_version):
    return Room.objects.create(
        name="Room A", floor=floor, audit_version=audit_version,
    )


@pytest.fixture
def log_entry(db, room, audit_version):
    return LogEntry.objects.create(
        room=room, audit_version=audit_version, fixture_id="F001",
    )


@pytest.fixture
def flag(db, log_entry, audit_version):
    return AuditFlag.objects.create(
        log_entry=log_entry,
        audit_version=audit_version,
        severity=FlagSeverity.WARN,
        message="Check this fixture carefully.",
    )


# ---- GET room audit-flags ----

@pytest.mark.django_db
def test_list_room_flags_requires_auth(client, audit_version, room):
    url = f"/api/audit-versions/{audit_version.pk}/rooms/{room.pk}/audit-flags/"
    response = client.get(url)
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_list_room_flags_returns_flags(client, user, audit_version, room, flag):
    client.force_login(user)
    url = f"/api/audit-versions/{audit_version.pk}/rooms/{room.pk}/audit-flags/"
    response = client.get(url)
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["message"] == "Check this fixture carefully."
    assert data[0]["severity"] == "warn"
    assert data[0]["status"] == "active"


@pytest.mark.django_db
def test_list_room_flags_wrong_version_404(client, user, audit_version, room):
    client.force_login(user)
    url = f"/api/audit-versions/9999/rooms/{room.pk}/audit-flags/"
    response = client.get(url)
    assert response.status_code == HTTPStatus.NOT_FOUND


# ---- POST dismiss ----

@pytest.mark.django_db
def test_dismiss_requires_auth(client, flag):
    response = client.post(
        f"/api/audit-flags/{flag.pk}/dismiss/",
        data={"reason": "Not relevant"},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_dismiss_flag_with_reason(client, user, flag):
    client.force_login(user)
    response = client.post(
        f"/api/audit-flags/{flag.pk}/dismiss/",
        data={"reason": "Already addressed in renovation plan."},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["status"] == "dismissed"
    assert data["dismissed_reason"] == "Already addressed in renovation plan."
    flag.refresh_from_db()
    assert flag.status == FlagStatus.DISMISSED
    assert flag.dismissed_by_id == user.pk


@pytest.mark.django_db
def test_dismiss_flag_without_reason(client, user, flag):
    client.force_login(user)
    response = client.post(
        f"/api/audit-flags/{flag.pk}/dismiss/",
        data={"reason": ""},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    assert response.json()["status"] == "dismissed"


@pytest.mark.django_db
def test_dismiss_flag_not_found(client, user):
    client.force_login(user)
    response = client.post(
        "/api/audit-flags/9999/dismiss/",
        data={"reason": ""},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.NOT_FOUND
