"""Tests for SPA catch-all view (US-056)."""
from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import patch

import pytest

if TYPE_CHECKING:
    from pathlib import Path

    from django.test import Client


@pytest.fixture
def spa_dir(tmp_path: Path) -> Path:
    """Temporary frontend/dist directory with stub index.html."""
    dist = tmp_path / "frontend" / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text(
        '<!doctype html><html><body id="root"></body></html>',
        encoding="utf-8",
    )
    return dist


@pytest.mark.django_db
def test_spa_login_returns_200(client: Client, spa_dir: Path) -> None:
    with patch("light_audit.audit.views._spa_root", return_value=spa_dir):
        response = client.get("/login")
    assert response.status_code == 200  # noqa: PLR2004


@pytest.mark.django_db
def test_spa_projects_returns_200(client: Client, spa_dir: Path) -> None:
    with patch("light_audit.audit.views._spa_root", return_value=spa_dir):
        response = client.get("/projects")
    assert response.status_code == 200  # noqa: PLR2004


@pytest.mark.django_db
def test_spa_nested_route_returns_200(client: Client, spa_dir: Path) -> None:
    with patch("light_audit.audit.views._spa_root", return_value=spa_dir):
        response = client.get("/projects/1")
    assert response.status_code == 200  # noqa: PLR2004


@pytest.mark.django_db
def test_spa_audit_version_route(client: Client, spa_dir: Path) -> None:
    with patch("light_audit.audit.views._spa_root", return_value=spa_dir):
        response = client.get("/audit-versions/1/rooms/2")
    assert response.status_code == 200  # noqa: PLR2004


@pytest.mark.django_db
def test_spa_content_type_html(client: Client, spa_dir: Path) -> None:
    with patch("light_audit.audit.views._spa_root", return_value=spa_dir):
        response = client.get("/login")
    assert "text/html" in response["Content-Type"]


@pytest.mark.django_db
def test_spa_not_built_returns_404(client: Client, tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    with patch("light_audit.audit.views._spa_root", return_value=empty):
        response = client.get("/login")
    assert response.status_code == 404  # noqa: PLR2004
