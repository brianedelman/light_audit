from django.contrib.admin.views.decorators import staff_member_required
from ninja import NinjaAPI
from ninja.security import SessionAuth

api = NinjaAPI(
    urls_namespace="api",
    auth=SessionAuth(),
    docs_decorator=staff_member_required,
)

api.add_router("/users/", "light_audit.users.api.views.router")
api.add_router("/auth/", "light_audit.users.api.auth.router")
api.add_router("/projects/", "light_audit.audit.api.views.projects_router")
api.add_router("/buildings/", "light_audit.audit.api.views.buildings_router")
api.add_router("/audit-versions/", "light_audit.audit.api.views.audit_versions_router")
api.add_router("/audits/", "light_audit.audit.api.sync.sync_router")
api.add_router("/media/", "light_audit.audit.api.media.media_router")
