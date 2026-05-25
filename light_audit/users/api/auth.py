from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.contrib.auth import login
from django.contrib.auth import logout
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.template.loader import render_to_string
from ninja import Router
from ninja import Schema
from ninja.responses import Status

from light_audit.users.api.schema import UserSchema

router = Router(tags=["auth"])

User = get_user_model()


class LoginSchema(Schema):
    email: str
    password: str


class MessageSchema(Schema):
    detail: str


class PasswordResetRequestSchema(Schema):
    email: str


class PasswordResetConfirmSchema(Schema):
    email: str
    token: str
    new_password: str


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


@router.post(
    "/password-reset/",
    response={200: MessageSchema},
    auth=None,
)
def password_reset_request(request, data: PasswordResetRequestSchema):
    """Issue a password-reset email if the address is known."""
    try:
        user = User.objects.get(email__iexact=data.email)
    except User.DoesNotExist:
        # Always respond 200 to avoid user enumeration.
        return {"detail": "If that email is registered you will receive a reset link."}

    token = default_token_generator.make_token(user)
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    reset_url = f"{frontend_url}/reset-password?email={user.email}&token={token}"

    body = render_to_string(
        "users/password_reset_email.txt",
        {"user": user, "reset_url": reset_url},
    )
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@lightaudit.com")
    send_mail(
        subject="Reset your Light Audit password",
        message=body,
        from_email=from_email,
        recipient_list=[user.email],
        fail_silently=False,
    )
    return {"detail": "If that email is registered you will receive a reset link."}


@router.post(
    "/password-reset/confirm/",
    response={200: MessageSchema, 400: MessageSchema},
    auth=None,
)
def password_reset_confirm(request, data: PasswordResetConfirmSchema):
    """Accept a token + new password, update the user's password."""
    try:
        user = User.objects.get(email__iexact=data.email)
    except User.DoesNotExist:
        return Status(400, {"detail": "Invalid token."})

    if not default_token_generator.check_token(user, data.token):
        return Status(400, {"detail": "Invalid token."})

    user.set_password(data.new_password)
    user.save(update_fields=["password"])
    return {"detail": "Password has been reset."}
