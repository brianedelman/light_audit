from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class R2MediaStorage(S3Boto3Storage):
    """Cloudflare R2 storage backend using S3-compatible API."""

    bucket_name = settings.R2_BUCKET
    endpoint_url = settings.R2_ENDPOINT_URL
    access_key = settings.R2_ACCESS_KEY_ID
    secret_key = settings.R2_SECRET_ACCESS_KEY
    default_acl = None
    custom_domain = None
    signature_version = "s3v4"
    region_name = "auto"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if settings.R2_PUBLIC_URL:
            self.custom_domain = settings.R2_PUBLIC_URL.removeprefix(
                "https://",
            ).removeprefix("http://")
