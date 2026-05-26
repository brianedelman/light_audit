from django.urls import re_path

from light_audit.audit.consumers import AuditReviewConsumer
from light_audit.audit.consumers import ProjectChatConsumer

websocket_urlpatterns = [
    re_path(
        r"^ws/audit-review/(?P<audit_version_id>\d+)/$",
        AuditReviewConsumer.as_asgi(),
    ),
    re_path(
        r"^ws/project-chat/(?P<project_id>\d+)/$",
        ProjectChatConsumer.as_asgi(),
    ),
]
