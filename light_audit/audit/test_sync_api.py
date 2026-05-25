"""Tests for POST /api/audits/sync."""

import uuid
from http import HTTPStatus

import pytest
from django.contrib.auth import get_user_model

from light_audit.audit.models import AuditVersion
from light_audit.audit.models import Building
from light_audit.audit.models import Floor
from light_audit.audit.models import LogEntry
from light_audit.audit.models import Project
from light_audit.audit.models import Room

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="sync@example.com", password="pass")  # noqa: S106


@pytest.fixture
def project(db, user):
    return Project.objects.create(name="Sync Project", owner=user)


@pytest.fixture
def building(db, project):
    return Building.objects.create(
        name="Sync Building",
        project=project,
        client_uuid=uuid.uuid4(),
    )


MINIMAL_PAYLOAD = {
    "floors": [],
}


def make_request(building, client_uuid=None, payload=None):
    data = {
        "building_uuid": str(building.client_uuid),
        "payload": payload or MINIMAL_PAYLOAD,
    }
    if client_uuid is not None:
        data["client_uuid"] = str(client_uuid)
    return data


# ---------- auth ----------

@pytest.mark.django_db
def test_sync_requires_auth(client):
    response = client.post(
        "/api/audits/sync",
        data={"building_uuid": str(uuid.uuid4()), "payload": MINIMAL_PAYLOAD},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.UNAUTHORIZED


# ---------- create ----------

@pytest.mark.django_db
def test_sync_creates_audit_version(client, user, building):
    client.force_login(user)
    response = client.post(
        "/api/audits/sync",
        data=make_request(building),
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["created"] is True
    assert data["version_number"] == 1
    assert AuditVersion.objects.filter(building=building).count() == 1


@pytest.mark.django_db
def test_sync_stores_source_payload(client, user, building):
    client.force_login(user)
    payload = {"floors": [{"name": "1F", "rooms": []}]}
    response = client.post(
        "/api/audits/sync",
        data=make_request(building, payload=payload),
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    version = AuditVersion.objects.get(pk=response.json()["version_id"])
    assert version.source_payload["floors"][0]["name"] == "1F"


@pytest.mark.django_db
def test_sync_creates_floors_rooms_log_entries(client, user, building):
    client.force_login(user)
    payload = {
        "floors": [
            {
                "name": "Ground Floor",
                "level": 1,
                "rooms": [
                    {
                        "name": "Room 101",
                        "room_type": "office",
                        "log_entries": [
                            {"fixture_id": "E1", "qty": 4, "wattage": 32.5},
                            {"fixture_id": "E2", "qty": 2},
                        ],
                    },
                ],
            },
        ],
    }
    response = client.post(
        "/api/audits/sync",
        data=make_request(building, payload=payload),
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    version_id = response.json()["version_id"]
    expected_entries = 2
    assert Floor.objects.filter(audit_version_id=version_id).count() == 1
    assert Room.objects.filter(audit_version_id=version_id).count() == 1
    entry_count = LogEntry.objects.filter(audit_version_id=version_id).count()
    assert entry_count == expected_entries


# ---------- idempotency ----------

@pytest.mark.django_db
def test_sync_idempotent_replay(client, user, building):
    """Same client_uuid → return existing version, don't create duplicate."""
    client.force_login(user)
    client_uuid = uuid.uuid4()
    data = make_request(building, client_uuid=client_uuid)

    r1 = client.post("/api/audits/sync", data=data, content_type="application/json")
    r2 = client.post("/api/audits/sync", data=data, content_type="application/json")

    assert r1.status_code == HTTPStatus.OK
    assert r2.status_code == HTTPStatus.OK

    d1, d2 = r1.json(), r2.json()
    assert d1["created"] is True
    assert d2["created"] is False
    assert d1["version_id"] == d2["version_id"]
    assert AuditVersion.objects.filter(building=building).count() == 1


@pytest.mark.django_db
def test_sync_without_client_uuid_creates_new_version_each_time(client, user, building):
    client.force_login(user)
    data = make_request(building)
    r1 = client.post("/api/audits/sync", data=data, content_type="application/json")
    r2 = client.post("/api/audits/sync", data=data, content_type="application/json")
    expected_versions = 2
    assert r1.json()["version_id"] != r2.json()["version_id"]
    assert AuditVersion.objects.filter(building=building).count() == expected_versions


# ---------- 404 ----------

@pytest.mark.django_db
def test_sync_unknown_building_uuid_returns_404(client, user):
    client.force_login(user)
    response = client.post(
        "/api/audits/sync",
        data={"building_uuid": str(uuid.uuid4()), "payload": MINIMAL_PAYLOAD},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.NOT_FOUND
