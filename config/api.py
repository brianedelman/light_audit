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
