from django.db.models.signals import post_save
from django.dispatch import receiver

from light_audit.audit.models import Photo
from light_audit.audit.models import PhotoUploadStatus


@receiver(post_save, sender=Photo)
def trigger_thumbnail_on_upload(sender, instance: Photo, **kwargs) -> None:
    """Trigger thumbnail generation when a Photo transitions to 'uploaded'."""
    # Only fire when upload_status just became UPLOADED
    if instance.upload_status != PhotoUploadStatus.UPLOADED:
        return
    if not instance.storage_path:
        return

    # Import here to avoid circular imports at module load time
    from light_audit.audit.tasks import generate_thumbnail  # noqa: PLC0415

    generate_thumbnail.delay(instance.pk)
