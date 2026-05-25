from __future__ import annotations

from http import HTTPStatus

import pytest
from django.contrib.auth.tokens import default_token_generator
from django.core import mail

from light_audit.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def user():
    return UserFactory.create(password="oldpassword")  # noqa: S106


# ---------------------------------------------------------------------------
# POST /api/auth/password-reset/
# ---------------------------------------------------------------------------


def test_password_reset_sends_email(client, user):
    response = client.post(
        "/api/auth/password-reset/",
        data={"email": user.email},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    assert len(mail.outbox) == 1
    assert user.email in mail.outbox[0].to
    assert "reset" in mail.outbox[0].subject.lower()


def test_password_reset_email_contains_token_url(client, user):
    client.post(
        "/api/auth/password-reset/",
        data={"email": user.email},
        content_type="application/json",
    )
    body = mail.outbox[0].body
    assert "reset-password" in body
    assert user.email in body


def test_password_reset_unknown_email_returns_200(client):
    """Must not reveal whether the email is registered."""
    response = client.post(
        "/api/auth/password-reset/",
        data={"email": "nobody@example.com"},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    assert len(mail.outbox) == 0


def test_password_reset_is_anonymous(client, user):
    """Endpoint must not require a session."""
    response = client.post(
        "/api/auth/password-reset/",
        data={"email": user.email},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK


# ---------------------------------------------------------------------------
# POST /api/auth/password-reset/confirm/
# ---------------------------------------------------------------------------


def test_password_reset_confirm_happy_path(client, user):
    token = default_token_generator.make_token(user)
    response = client.post(
        "/api/auth/password-reset/confirm/",
        data={"email": user.email, "token": token, "new_password": "newpass123"},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    assert "reset" in response.json()["detail"].lower()

    # Password actually changed
    user.refresh_from_db()
    assert user.check_password("newpass123")


def test_password_reset_confirm_invalid_token(client, user):
    response = client.post(
        "/api/auth/password-reset/confirm/",
        data={"email": user.email, "token": "bad-token", "new_password": "x"},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert "Invalid token" in response.json()["detail"]


def test_password_reset_confirm_unknown_email(client):
    response = client.post(
        "/api/auth/password-reset/confirm/",
        data={"email": "nobody@example.com", "token": "tok", "new_password": "x"},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_password_reset_token_single_use(client, user):
    """Token must be invalidated after the password changes."""
    token = default_token_generator.make_token(user)

    # First use: success
    r1 = client.post(
        "/api/auth/password-reset/confirm/",
        data={"email": user.email, "token": token, "new_password": "firstnew"},
        content_type="application/json",
    )
    assert r1.status_code == HTTPStatus.OK

    # Second use: token no longer valid (password hash changed)
    r2 = client.post(
        "/api/auth/password-reset/confirm/",
        data={"email": user.email, "token": token, "new_password": "secondnew"},
        content_type="application/json",
    )
    assert r2.status_code == HTTPStatus.BAD_REQUEST
