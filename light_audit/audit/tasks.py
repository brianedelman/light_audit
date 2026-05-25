import io
import logging

import boto3
from celery import shared_task
from django.conf import settings
from PIL import Image

logger = logging.getLogger(__name__)

THUMBNAIL_SIZE = (300, 300)


def _get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


@shared_task(bind=True, max_retries=3)
def generate_thumbnail(self, photo_id: int) -> None:
    """Download photo from R2, create 300x300 thumbnail, upload back to R2."""
    from light_audit.audit.models import Photo  # noqa: PLC0415

    try:
        photo = Photo.objects.get(pk=photo_id)
    except Photo.DoesNotExist:
        logger.warning("generate_thumbnail: Photo %s not found", photo_id)
        return

    if not photo.storage_path:
        logger.warning("generate_thumbnail: Photo %s has no storage_path", photo_id)
        return

    client = _get_r2_client()

    # Download original from R2
    response = client.get_object(Bucket=settings.R2_BUCKET, Key=photo.storage_path)
    image_data = response["Body"].read()

    # Resize to 300x300 (thumbnail preserves aspect ratio)
    img = Image.open(io.BytesIO(image_data))
    img.thumbnail(THUMBNAIL_SIZE)

    # Convert to RGB if needed (e.g. RGBA PNG)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Encode as JPEG
    output = io.BytesIO()
    img.save(output, format="JPEG", quality=85)
    output.seek(0)

    # Upload thumbnail with _thumb suffix
    thumb_path = _thumbnail_path(photo.storage_path)
    client.put_object(
        Bucket=settings.R2_BUCKET,
        Key=thumb_path,
        Body=output,
        ContentType="image/jpeg",
    )

    # Build public thumbnail URL
    if settings.R2_PUBLIC_URL:
        thumbnail_url = f"{settings.R2_PUBLIC_URL.rstrip('/')}/{thumb_path}"
    else:
        thumbnail_url = thumb_path

    photo.thumbnail_url = thumbnail_url
    photo.save(update_fields=["thumbnail_url"])

    logger.info("generate_thumbnail: Photo %s thumbnail at %s", photo_id, thumbnail_url)


def _thumbnail_path(storage_path: str) -> str:
    """Insert '_thumb' before the file extension."""
    if "." in storage_path.rsplit("/", maxsplit=1)[-1]:
        base, _ext = storage_path.rsplit(".", 1)
        return f"{base}_thumb.jpg"
    return f"{storage_path}_thumb.jpg"
