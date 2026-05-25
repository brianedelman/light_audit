from __future__ import annotations

from http import HTTPStatus

import pytest

from light_audit.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def user():
    return UserFactory.create(password="correct-password")  # noqa: S106


def test_login_happy_path(client, user):
    response = client.post(
        "/api/auth/login/",
        data={"email": user.email, "password": "correct-password"},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.OK
    assert response.json()["email"] == user.email


def test_login_wrong_password(client, user):
    response = client.post(
        "/api/auth/login/",
        data={"email": user.email, "password": "wrong"},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert response.json()["detail"] == "Invalid credentials."


def test_login_unknown_email(client):
    response = client.post(
        "/api/auth/login/",
        data={"email": "nobody@example.com", "password": "any"},
        content_type="application/json",
    )
    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_login_anonymous_allowed(client):
    """Login endpoint must not require auth."""
    response = client.post(
        "/api/auth/login/",
        data={"email": "x@x.com", "password": "x"},
        content_type="application/json",
    )
    # Returns 401 for bad creds, NOT 401 for missing session
    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert "Invalid credentials" in response.json()["detail"]


def test_me_returns_current_user(client, user):
    client.force_login(user)
    response = client.get("/api/auth/me/")
    assert response.status_code == HTTPStatus.OK
    assert response.json()["email"] == user.email


def test_me_requires_auth(client):
    response = client.get("/api/auth/me/")
    assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_logout(client, user):
    client.force_login(user)
    response = client.post("/api/auth/logout/")
    assert response.status_code == HTTPStatus.OK
    assert response.json()["detail"] == "Logged out."
    # Now me/ should fail
    me = client.get("/api/auth/me/")
    assert me.status_code == HTTPStatus.UNAUTHORIZED


def test_logout_requires_auth(client):
    response = client.post("/api/auth/logout/")
    assert response.status_code == HTTPStatus.UNAUTHORIZED
