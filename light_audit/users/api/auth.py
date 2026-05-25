from django.contrib.auth import authenticate
from django.contrib.auth import login
from django.contrib.auth import logout
from ninja import Router
from ninja import Schema
from ninja.responses import Status

from light_audit.users.api.schema import UserSchema

router = Router(tags=["auth"])


class LoginSchema(Schema):
    email: str
    password: str


class MessageSchema(Schema):
    detail: str


@router.post("/login/", response={200: UserSchema, 401: MessageSchema}, auth=None)
def auth_login(request, data: LoginSchema):
    user = authenticate(request, username=data.email, password=data.password)
    if user is None:
        return Status(401, {"detail": "Invalid credentials."})
    login(request, user)
    return Status(200, user)


@router.post("/logout/", response=MessageSchema)
def auth_logout(request):
    logout(request)
    return {"detail": "Logged out."}


@router.get("/me/", response=UserSchema)
def auth_me(request):
    return request.user
