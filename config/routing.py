from django.urls import re_path

from light_audit.audit.consumers import AuditReviewConsumer

websocket_urlpatterns = [
    re_path(
        r"^ws/audit-review/(?P<audit_version_id>\d+)/$",
        AuditReviewConsumer.as_asgi(),
    ),
]
