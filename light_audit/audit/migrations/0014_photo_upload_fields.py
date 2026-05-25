from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("audit", "0013_building_client_uuid"),
    ]

    operations = [
        migrations.AddField(
            model_name="photo",
            name="upload_status",
            field=models.CharField(
                max_length=20,
                choices=[
                    ("uploading", "Uploading"),
                    ("uploaded", "Uploaded"),
                    ("failed", "Failed"),
                ],
                blank=True,
                default="",
            ),
        ),
        migrations.AddField(
            model_name="photo",
            name="r2_upload_id",
            field=models.CharField(max_length=500, blank=True, default=""),
            preserve_default=False,
        ),
    ]
