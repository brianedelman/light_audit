"""Tests for R2 multipart upload endpoints."""

from http import HTTPStatus
from unittest.mock import MagicMock
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model

from light_audit.audit.models import Building
from light_audit.audit.models import Photo
from light_audit.audit.models import PhotoUploadStatus
from light_audit.audit.models import Project

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="media@example.com", password="pass")  # noqa: S106


@pytest.fixture
def project(db, user):
    return Project.objects.create(name="Media Project", owner=user)


@pytest.fixture
def building(db, project):
    return Building.objects.create(name="Media Building", project=project)


@pytest.fixture
def auth_client(client, user):
    client.force_login(user)
    return client


@pytest.fixture
def photo(db, building, user):
    return Photo.objects.create(
        building=building,
        storage_path="media/1/abc/test.jpg",
        mime_type="image/jpeg",
        upload_status=PhotoUploadStatus.UPLOADING,
        r2_upload_id="test-upload-id-123",
        user=user,
    )


# --- Auth guard ---

def test_start_requires_auth(client, building):
    resp = client.post(
        "/api/media/multipart/start",
        data={
            "building_id": building.pk,
            "filename": "test.jpg",
            "mime_type": "image/jpeg",
        },
        content_type="application/json",
    )
    assert resp.status_code == HTTPStatus.UNAUTHORIZED


# --- Start ---

def test_multipart_start(auth_client, building):
    mock_client = MagicMock()
    mock_client.create_multipart_upload.return_value = {"UploadId": "upload-abc-123"}

    with patch("light_audit.audit.api.media._get_r2_client", return_value=mock_client):
        resp = auth_client.post(
            "/api/media/multipart/start",
            data={
                "building_id": building.pk,
                "filename": "photo.jpg",
                "mime_type": "image/jpeg",
                "photo_type": "fixture",
            },
            content_type="application/json",
        )

    assert resp.status_code == HTTPStatus.OK
    data = resp.json()
    assert data["upload_id"] == "upload-abc-123"
    assert "storage_path" in data
    assert "photo_id" in data

    photo = Photo.objects.get(pk=data["photo_id"])
    assert photo.upload_status == PhotoUploadStatus.UPLOADING
    assert photo.r2_upload_id == "upload-abc-123"
    assert photo.building == building
    mock_client.create_multipart_upload.assert_called_once()


# --- Sign part ---

def test_multipart_sign_part(auth_client, photo):
    mock_client = MagicMock()
    mock_client.generate_presigned_url.return_value = "https://r2.example.com/presigned"

    with patch("light_audit.audit.api.media._get_r2_client", return_value=mock_client):
        resp = auth_client.post(
            "/api/media/multipart/sign-part",
            data={"photo_id": photo.pk, "part_number": 1},
            content_type="application/json",
        )

    assert resp.status_code == HTTPStatus.OK
    data = resp.json()
    assert data["presigned_url"] == "https://r2.example.com/presigned"
    mock_client.generate_presigned_url.assert_called_once_with(
        "upload_part",
        Params={
            "Bucket": mock_client.generate_presigned_url.call_args[1]["Params"][
                "Bucket"
            ],
            "Key": photo.storage_path,
            "UploadId": photo.r2_upload_id,
            "PartNumber": 1,
        },
        ExpiresIn=3600,
    )


# --- Complete ---

def test_multipart_complete(auth_client, photo):
    mock_client = MagicMock()
    mock_client.complete_multipart_upload.return_value = {}

    with patch("light_audit.audit.api.media._get_r2_client", return_value=mock_client):
        resp = auth_client.post(
            "/api/media/multipart/complete",
            data={
                "photo_id": photo.pk,
                "parts": [{"part_number": 1, "etag": '"abc123"'}],
            },
            content_type="application/json",
        )

    assert resp.status_code == HTTPStatus.OK
    data = resp.json()
    assert data["photo_id"] == photo.pk
    assert "public_url" in data

    photo.refresh_from_db()
    assert photo.upload_status == PhotoUploadStatus.UPLOADED
    assert photo.public_url != ""
    mock_client.complete_multipart_upload.assert_called_once()


# --- Abort ---

def test_multipart_abort(auth_client, photo):
    mock_client = MagicMock()
    mock_client.abort_multipart_upload.return_value = {}

    with patch("light_audit.audit.api.media._get_r2_client", return_value=mock_client):
        resp = auth_client.post(
            "/api/media/multipart/abort",
            data={"photo_id": photo.pk},
            content_type="application/json",
        )

    assert resp.status_code == HTTPStatus.OK
    data = resp.json()
    assert data["photo_id"] == photo.pk
    assert data["aborted"] is True

    photo.refresh_from_db()
    assert photo.upload_status == PhotoUploadStatus.FAILED
    mock_client.abort_multipart_upload.assert_called_once()


# --- 404 cases ---

def test_start_404_building(auth_client):
    mock_client = MagicMock()
    with patch("light_audit.audit.api.media._get_r2_client", return_value=mock_client):
        resp = auth_client.post(
            "/api/media/multipart/start",
            data={"building_id": 99999, "filename": "x.jpg", "mime_type": "image/jpeg"},
            content_type="application/json",
        )
    assert resp.status_code == HTTPStatus.NOT_FOUND


def test_sign_part_404_photo(auth_client):
    mock_client = MagicMock()
    with patch("light_audit.audit.api.media._get_r2_client", return_value=mock_client):
        resp = auth_client.post(
            "/api/media/multipart/sign-part",
            data={"photo_id": 99999, "part_number": 1},
            content_type="application/json",
        )
    assert resp.status_code == HTTPStatus.NOT_FOUND
