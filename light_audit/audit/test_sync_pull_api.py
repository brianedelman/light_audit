"""Tests for US-023: GET /api/audits/{version_id}, GET /api/projects/{id}/audits,
POST /api/audit-versions/{id}/push-to-ipad, GET /api/buildings/{id}/available-version.
"""

import uuid
from http import HTTPStatus

import pytest
from django.contrib.auth import get_user_model

from light_audit.audit.models import AuditVersion
from light_audit.audit.models import AuditVersionStatus
from light_audit.audit.models import Building
from light_audit.audit.models import Project

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="pull@example.com", password="pass")  # noqa: S106


@pytest.fixture
def project(db, user):
    return Project.objects.create(name="Pull Project", owner=user)


@pytest.fixture
def building(db, project):
    return Building.objects.create(
        name="Pull Building",
        project=project,
        client_uuid=uuid.uuid4(),
    )


@pytest.fixture
def version(db, building, user):
    return AuditVersion.objects.create(
        building=building,
        created_by=user,
        source_payload={"floors": [{"name": "G", "rooms": []}]},
    )


# ---------- GET /api/audits/{version_id} ----------

@pytest.mark.django_db
def test_pull_version_requires_auth(client, version):
    response = client.get(f"/api/audits/{version.pk}")
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_pull_version_returns_payload(client, user, version):
    client.force_login(user)
    response = client.get(f"/api/audits/{version.pk}")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["version_id"] == version.pk
    assert data["version_number"] == version.version_number
    assert data["payload"]["floors"][0]["name"] == "G"


@pytest.mark.django_db
def test_pull_version_404_on_missing(client, user):
    client.force_login(user)
    response = client.get("/api/audits/99999")
    assert response.status_code == HTTPStatus.NOT_FOUND


# ---------- GET /api/projects/{id}/audits ----------

@pytest.mark.django_db
def test_list_project_audits_requires_auth(client, project, version):
    response = client.get(f"/api/projects/{project.pk}/audits/")
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_list_project_audits(client, user, project, building, version):
    client.force_login(user)
    response = client.get(f"/api/projects/{project.pk}/audits/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == version.pk


@pytest.mark.django_db
def test_list_project_audits_empty(client, user, project):
    client.force_login(user)
    response = client.get(f"/api/projects/{project.pk}/audits/")
    assert response.status_code == HTTPStatus.OK
    assert response.json() == []


# ---------- POST /api/audit-versions/{id}/push-to-ipad ----------

@pytest.mark.django_db
def test_push_to_ipad_requires_auth(client, version):
    response = client.post(f"/api/audit-versions/{version.pk}/push-to-ipad/")
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_push_to_ipad_sets_status(client, user, version):
    client.force_login(user)
    response = client.post(f"/api/audit-versions/{version.pk}/push-to-ipad/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["status"] == AuditVersionStatus.PUBLISHED_TO_IPAD
    version.refresh_from_db()
    assert version.status == AuditVersionStatus.PUBLISHED_TO_IPAD


@pytest.mark.django_db
def test_push_to_ipad_404_on_missing(client, user):
    client.force_login(user)
    response = client.post("/api/audit-versions/99999/push-to-ipad/")
    assert response.status_code == HTTPStatus.NOT_FOUND


# ---------- GET /api/buildings/{id}/available-version ----------

@pytest.mark.django_db
def test_available_version_requires_auth(client, building):
    response = client.get(f"/api/buildings/{building.pk}/available-version/")
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_available_version_none_when_no_pushed_version(client, user, building, version):
    client.force_login(user)
    response = client.get(f"/api/buildings/{building.pk}/available-version/")
    assert response.status_code == HTTPStatus.OK
    assert response.json() is None


@pytest.mark.django_db
def test_available_version_returns_pushed_version(client, user, building, version):
    version.status = AuditVersionStatus.PUBLISHED_TO_IPAD
    version.save()
    client.force_login(user)
    response = client.get(f"/api/buildings/{building.pk}/available-version/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["id"] == version.pk
    assert data["status"] == AuditVersionStatus.PUBLISHED_TO_IPAD
