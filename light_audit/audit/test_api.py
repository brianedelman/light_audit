from http import HTTPStatus

import pytest
from django.contrib.auth import get_user_model

from light_audit.audit.models import AuditVersion
from light_audit.audit.models import Building
from light_audit.audit.models import Floor
from light_audit.audit.models import Photo
from light_audit.audit.models import PhotoUploadStatus
from light_audit.audit.models import Project
from light_audit.audit.models import Room

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="api@example.com", password="pass")  # noqa: S106


@pytest.fixture
def project(db, user):
    return Project.objects.create(name="API Project", owner=user)


@pytest.fixture
def building(db, project):
    return Building.objects.create(name="API Building", project=project)


@pytest.fixture
def audit_version(db, building, user):
    return AuditVersion.objects.create(building=building, created_by=user)


# ---- Auth guard ----

@pytest.mark.django_db
def test_projects_requires_auth(client):
    response = client.get("/api/projects/")
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_buildings_requires_auth(client):
    response = client.get("/api/buildings/")
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_audit_versions_requires_auth(client):
    response = client.get("/api/audit-versions/")
    assert response.status_code == HTTPStatus.UNAUTHORIZED


# ---- Projects ----

@pytest.mark.django_db
def test_list_projects(client, user, project):
    client.force_login(user)
    response = client.get("/api/projects/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "API Project"


@pytest.mark.django_db
def test_retrieve_project(client, user, project):
    client.force_login(user)
    response = client.get(f"/api/projects/{project.pk}/")
    assert response.status_code == HTTPStatus.OK
    assert response.json()["name"] == "API Project"


@pytest.mark.django_db
def test_create_project(client, user):
    client.force_login(user)
    response = client.post(
        "/api/projects/",
        data={"name": "New Project", "client": "Acme"},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    assert response.json()["name"] == "New Project"


@pytest.mark.django_db
def test_list_project_buildings(client, user, project, building):
    client.force_login(user)
    response = client.get(f"/api/projects/{project.pk}/buildings/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "API Building"


# ---- Buildings ----

@pytest.mark.django_db
def test_list_buildings(client, user, building):
    client.force_login(user)
    response = client.get("/api/buildings/")
    assert response.status_code == HTTPStatus.OK
    assert len(response.json()) == 1


@pytest.mark.django_db
def test_retrieve_building(client, user, building):
    client.force_login(user)
    response = client.get(f"/api/buildings/{building.pk}/")
    assert response.status_code == HTTPStatus.OK
    assert response.json()["name"] == "API Building"


@pytest.mark.django_db
def test_create_building(client, user, project):
    client.force_login(user)
    response = client.post(
        "/api/buildings/",
        data={"name": "New Building", "project_id": project.pk},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    assert response.json()["name"] == "New Building"


@pytest.mark.django_db
def test_list_building_audit_versions(client, user, building, audit_version):
    client.force_login(user)
    response = client.get(f"/api/buildings/{building.pk}/audit-versions/")
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["version_number"] == 1


# ---- Audit Versions ----

@pytest.mark.django_db
def test_list_audit_versions(client, user, audit_version):
    client.force_login(user)
    response = client.get("/api/audit-versions/")
    assert response.status_code == HTTPStatus.OK
    assert len(response.json()) == 1


@pytest.mark.django_db
def test_retrieve_audit_version(client, user, audit_version):
    client.force_login(user)
    response = client.get(f"/api/audit-versions/{audit_version.pk}/")
    assert response.status_code == HTTPStatus.OK
    assert response.json()["version_number"] == 1


# ---- Room photos ----

@pytest.fixture
def floor(db, building, audit_version):
    return Floor.objects.create(building=building, audit_version=audit_version, name="Floor 1", level=1)


@pytest.fixture
def room(db, audit_version, floor):
    return Room.objects.create(floor=floor, audit_version=audit_version, name="Room A")


@pytest.fixture
def uploaded_photo(db, building, room):
    return Photo.objects.create(
        building=building,
        room=room,
        photo_type="fixture",
        public_url="https://example.com/photo.jpg",
        thumbnail_url="https://example.com/thumb.jpg",
        upload_status=PhotoUploadStatus.UPLOADED,
    )


@pytest.fixture
def uploading_photo(db, building, room):
    return Photo.objects.create(
        building=building,
        room=room,
        photo_type="switch",
        public_url="",
        upload_status=PhotoUploadStatus.UPLOADING,
    )


@pytest.mark.django_db
def test_list_room_photos_returns_uploaded(client, user, audit_version, room, uploaded_photo, uploading_photo):
    client.force_login(user)
    url = f"/api/audit-versions/{audit_version.pk}/rooms/{room.pk}/photos/"
    response = client.get(url)
    assert response.status_code == HTTPStatus.OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["public_url"] == "https://example.com/photo.jpg"
    assert data[0]["thumbnail_url"] == "https://example.com/thumb.jpg"


@pytest.mark.django_db
def test_list_room_photos_requires_auth(client, audit_version, room):
    url = f"/api/audit-versions/{audit_version.pk}/rooms/{room.pk}/photos/"
    response = client.get(url)
    assert response.status_code == HTTPStatus.UNAUTHORIZED


@pytest.mark.django_db
def test_list_room_photos_wrong_version_returns_404(client, user, audit_version, room):
    client.force_login(user)
    url = f"/api/audit-versions/9999/rooms/{room.pk}/photos/"
    response = client.get(url)
    assert response.status_code == HTTPStatus.NOT_FOUND
