import uuid

import boto3
from django.conf import settings
from django.shortcuts import get_object_or_404
from ninja import Router
from ninja import Schema

from light_audit.audit.models import Building
from light_audit.audit.models import Photo
from light_audit.audit.models import PhotoUploadStatus

media_router = Router(tags=["media"])


def _get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


# --- Schemas ---


class MultipartStartRequest(Schema):
    building_id: int
    filename: str
    mime_type: str
    photo_type: str = "fixture"


class MultipartStartResponse(Schema):
    photo_id: int
    upload_id: str
    storage_path: str


class MultipartSignPartRequest(Schema):
    photo_id: int
    part_number: int


class MultipartSignPartResponse(Schema):
    presigned_url: str


class PartETag(Schema):
    part_number: int
    etag: str


class MultipartCompleteRequest(Schema):
    photo_id: int
    parts: list[PartETag]


class MultipartCompleteResponse(Schema):
    photo_id: int
    public_url: str


class MultipartAbortRequest(Schema):
    photo_id: int


class MultipartAbortResponse(Schema):
    photo_id: int
    aborted: bool


# --- Endpoints ---


@media_router.post("/multipart/start", response=MultipartStartResponse)
def multipart_start(request, data: MultipartStartRequest):
    """Create Photo row and initiate R2 multipart upload."""
    building = get_object_or_404(Building, pk=data.building_id)

    storage_path = f"media/{building.pk}/{uuid.uuid4()}/{data.filename}"

    photo = Photo.objects.create(
        building=building,
        storage_path=storage_path,
        mime_type=data.mime_type,
        photo_type=data.photo_type,
        upload_status=PhotoUploadStatus.UPLOADING,
        user=request.user,
    )

    client = _get_r2_client()
    response = client.create_multipart_upload(
        Bucket=settings.R2_BUCKET,
        Key=storage_path,
        ContentType=data.mime_type,
    )
    upload_id = response["UploadId"]

    photo.r2_upload_id = upload_id
    photo.save(update_fields=["r2_upload_id"])

    return MultipartStartResponse(
        photo_id=photo.pk,
        upload_id=upload_id,
        storage_path=storage_path,
    )


@media_router.post("/multipart/sign-part", response=MultipartSignPartResponse)
def multipart_sign_part(request, data: MultipartSignPartRequest):
    """Return presigned PUT URL for a specific part."""
    photo = get_object_or_404(Photo, pk=data.photo_id)

    client = _get_r2_client()
    presigned_url = client.generate_presigned_url(
        "upload_part",
        Params={
            "Bucket": settings.R2_BUCKET,
            "Key": photo.storage_path,
            "UploadId": photo.r2_upload_id,
            "PartNumber": data.part_number,
        },
        ExpiresIn=3600,
    )

    return MultipartSignPartResponse(presigned_url=presigned_url)


@media_router.post("/multipart/complete", response=MultipartCompleteResponse)
def multipart_complete(request, data: MultipartCompleteRequest):
    """Complete multipart upload and update Photo with public URL."""
    photo = get_object_or_404(Photo, pk=data.photo_id)

    parts = [
        {"PartNumber": p.part_number, "ETag": p.etag}
        for p in data.parts
    ]

    client = _get_r2_client()
    client.complete_multipart_upload(
        Bucket=settings.R2_BUCKET,
        Key=photo.storage_path,
        UploadId=photo.r2_upload_id,
        MultipartUpload={"Parts": parts},
    )

    public_url = (
        f"{settings.R2_PUBLIC_URL.rstrip('/')}/{photo.storage_path}"
        if settings.R2_PUBLIC_URL
        else photo.storage_path
    )

    photo.upload_status = PhotoUploadStatus.UPLOADED
    photo.public_url = public_url
    photo.save(update_fields=["upload_status", "public_url"])

    return MultipartCompleteResponse(photo_id=photo.pk, public_url=public_url)


@media_router.post("/multipart/abort", response=MultipartAbortResponse)
def multipart_abort(request, data: MultipartAbortRequest):
    """Abort multipart upload and mark Photo as failed."""
    photo = get_object_or_404(Photo, pk=data.photo_id)

    client = _get_r2_client()
    client.abort_multipart_upload(
        Bucket=settings.R2_BUCKET,
        Key=photo.storage_path,
        UploadId=photo.r2_upload_id,
    )

    photo.upload_status = PhotoUploadStatus.FAILED
    photo.save(update_fields=["upload_status"])

    return MultipartAbortResponse(photo_id=photo.pk, aborted=True)
