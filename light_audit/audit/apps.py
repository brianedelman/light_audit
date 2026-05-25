from django.apps import AppConfig


class AuditConfig(AppConfig):
    name = "light_audit.audit"

    def ready(self):
        import light_audit.audit.signals  # noqa: F401, PLC0415
