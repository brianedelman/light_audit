"""Tests for generate_thumbnail Celery task (US-025)."""
import io
from unittest.mock import MagicMock
from unittest.mock import patch

import pytest
from PIL import Image

from light_audit.audit.models import Photo
from light_audit.audit.models import PhotoUploadStatus
from light_audit.audit.tasks import THUMBNAIL_SIZE
from light_audit.audit.tasks import _thumbnail_path
from light_audit.audit.tasks import generate_thumbnail


def _make_jpeg_bytes(width: int = 800, height: int = 600) -> bytes:
    """Create a small in-memory JPEG for testing."""
    img = Image.new("RGB", (width, height), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf.read()


@pytest.fixture
def photo(db, django_user_model, building):
    """Photo in UPLOADED state with a storage_path."""
    user = django_user_model.objects.create_user(
        email="thumb_user@example.com", password="pw",  # noqa: S106
    )
    return Photo.objects.create(
        building=building,
        storage_path="media/1/abc/photo.jpg",
        upload_status=PhotoUploadStatus.UPLOADED,
        public_url="https://r2.example.com/media/1/abc/photo.jpg",
        user=user,
    )


@pytest.fixture
def building(db, django_user_model):
    """Minimal building fixture."""
    from light_audit.audit.models import Building  # noqa: PLC0415
    from light_audit.audit.models import Project  # noqa: PLC0415

    owner = django_user_model.objects.create_user(
        email="building_owner@example.com", password="pw",  # noqa: S106
    )
    project = Project.objects.create(name="Test Project", owner=owner)
    return Building.objects.create(name="Test Building", project=project)


# ── helper ──────────────────────────────────────────────────────────────────


def test_thumbnail_path_with_extension():
    assert _thumbnail_path("media/1/abc/photo.jpg") == "media/1/abc/photo_thumb.jpg"


def test_thumbnail_path_without_extension():
    assert _thumbnail_path("media/1/abc/photo") == "media/1/abc/photo_thumb.jpg"


# ── task: happy path ────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_generate_thumbnail_creates_and_uploads(photo, settings):
    """Task downloads, resizes, uploads thumbnail, sets thumbnail_url."""
    settings.R2_BUCKET = "test-bucket"
    settings.R2_PUBLIC_URL = "https://r2.example.com"

    jpeg_bytes = _make_jpeg_bytes()

    mock_client = MagicMock()
    mock_client.get_object.return_value = {
        "Body": MagicMock(read=MagicMock(return_value=jpeg_bytes)),
    }

    with patch("light_audit.audit.tasks._get_r2_client", return_value=mock_client):
        generate_thumbnail(photo.pk)

    # R2 downloaded original
    mock_client.get_object.assert_called_once_with(
        Bucket="test-bucket", Key="media/1/abc/photo.jpg",
    )

    # R2 uploaded thumbnail
    mock_client.put_object.assert_called_once()
    call_kwargs = mock_client.put_object.call_args.kwargs
    assert call_kwargs["Key"] == "media/1/abc/photo_thumb.jpg"
    assert call_kwargs["ContentType"] == "image/jpeg"

    # Photo.thumbnail_url updated
    photo.refresh_from_db()
    assert photo.thumbnail_url == "https://r2.example.com/media/1/abc/photo_thumb.jpg"


@pytest.mark.django_db
def test_generate_thumbnail_resizes_to_300(photo, settings):
    """Thumbnail image is at most 300px in each dimension."""
    settings.R2_BUCKET = "test-bucket"
    settings.R2_PUBLIC_URL = "https://r2.example.com"

    jpeg_bytes = _make_jpeg_bytes(800, 600)

    captured_body = {}

    def fake_put_object(**kwargs):
        captured_body["data"] = kwargs["Body"].read()

    mock_client = MagicMock()
    mock_client.get_object.return_value = {
        "Body": MagicMock(read=MagicMock(return_value=jpeg_bytes)),
    }
    mock_client.put_object.side_effect = fake_put_object

    with patch("light_audit.audit.tasks._get_r2_client", return_value=mock_client):
        generate_thumbnail(photo.pk)

    thumb_img = Image.open(io.BytesIO(captured_body["data"]))
    max_dim = THUMBNAIL_SIZE[0]
    assert thumb_img.width <= max_dim
    assert thumb_img.height <= max_dim


# ── task: edge cases ────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_generate_thumbnail_missing_photo(db):
    """Task is a no-op when Photo does not exist."""
    mock_client = MagicMock()
    with patch("light_audit.audit.tasks._get_r2_client", return_value=mock_client):
        generate_thumbnail(99999)

    mock_client.get_object.assert_not_called()


@pytest.mark.django_db
def test_generate_thumbnail_no_storage_path(photo, settings):
    """Task skips when storage_path is empty."""
    photo.storage_path = ""
    photo.save(update_fields=["storage_path"])

    mock_client = MagicMock()
    with patch("light_audit.audit.tasks._get_r2_client", return_value=mock_client):
        generate_thumbnail(photo.pk)

    mock_client.get_object.assert_not_called()


# ── signal: post_save trigger ────────────────────────────────────────────────


@pytest.mark.django_db
def test_signal_triggers_task_on_uploaded(photo):
    """post_save signal calls generate_thumbnail.delay when status→uploaded."""
    with patch(
        "light_audit.audit.tasks.generate_thumbnail",
    ) as mock_task:
        photo.upload_status = PhotoUploadStatus.UPLOADED
        photo.save(update_fields=["upload_status"])

    mock_task.delay.assert_called_once_with(photo.pk)


@pytest.mark.django_db
def test_signal_does_not_trigger_on_uploading(photo):
    """post_save signal ignores non-uploaded transitions."""
    with patch(
        "light_audit.audit.tasks.generate_thumbnail",
    ) as mock_task:
        photo.upload_status = PhotoUploadStatus.UPLOADING
        photo.save(update_fields=["upload_status"])

    mock_task.delay.assert_not_called()
