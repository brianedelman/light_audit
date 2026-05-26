"""Tests for US-039: POST /api/audit-versions/{id}/duplicate."""

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
    return User.objects.create_user(email="dup@example.com", password="pass")  # noqa: S106


@pytest.fixture
def project(db, user):
    return Project.objects.create(name="Dup Project", owner=user)


@pytest.fixture
def building(db, project):
    return Building.objects.create(name="Dup Building", project=project)


@pytest.fixture
def audit_version(db, building, user):
    return AuditVersion.objects.create(
        building=building,
        created_by=user,
        label="v1 Label",
        status=AuditVersionStatus.DRAFT,
        source_payload={"rooms": [{"id": "r1"}]},
    )


@pytest.mark.django_db
def test_duplicate_requires_auth(client, audit_version):
    response = client.post(f"/api/audit-versions/{audit_version.pk}/duplicate/")
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_duplicate_creates_new_draft(client, user, audit_version):
    client.force_login(user)
    response = client.post(f"/api/audit-versions/{audit_version.pk}/duplicate/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["status"] == AuditVersionStatus.DRAFT
    assert "Copy of" in data["label"]
    assert data["id"] != audit_version.pk


@pytest.mark.django_db
def test_duplicate_copies_payload(client, user, audit_version):
    client.force_login(user)
    response = client.post(f"/api/audit-versions/{audit_version.pk}/duplicate/")
    assert response.status_code == HTTPStatus.OK
    new_version = AuditVersion.objects.get(pk=response.json()["id"])
    assert new_version.source_payload == audit_version.source_payload


@pytest.mark.django_db
def test_duplicate_increments_version_number(client, user, audit_version):
    client.force_login(user)
    response = client.post(f"/api/audit-versions/{audit_version.pk}/duplicate/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert data["version_number"] > audit_version.version_number


@pytest.mark.django_db
def test_duplicate_label_uses_version_number_when_no_label(client, user, building):
    client.force_login(user)
    version = AuditVersion.objects.create(building=building, created_by=user, label="")
    response = client.post(f"/api/audit-versions/{version.pk}/duplicate/")
    assert response.status_code == HTTPStatus.OK
    assert f"Copy of v{version.version_number}" in response.json()["label"]


@pytest.mark.django_db
def test_duplicate_404_on_unknown(client, user):
    client.force_login(user)
    response = client.post("/api/audit-versions/99999/duplicate/")
    assert response.status_code == HTTPStatus.NOT_FOUND
