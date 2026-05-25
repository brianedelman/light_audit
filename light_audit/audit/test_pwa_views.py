"""Tests for PWA static-file serving views (US-029)."""
from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import patch

import pytest

if TYPE_CHECKING:
    from pathlib import Path

    from django.test import Client


@pytest.fixture
def pwa_dir(tmp_path: Path) -> Path:
    """Temporary dist/audit-pwa directory with stub files."""
    pwa = tmp_path / "dist" / "audit-pwa"
    pwa.mkdir(parents=True)
    (pwa / "index.html").write_text("<html>audit</html>", encoding="utf-8")
    (pwa / "manifest.json").write_text('{"name":"Audit"}', encoding="utf-8")
    (pwa / "sw.js").write_text("// sw", encoding="utf-8")
    icons = pwa / "icons"
    icons.mkdir()
    (icons / "icon-192.png").write_bytes(b"\x89PNG")
    return pwa


@pytest.fixture
def pwa_client(client: Client, pwa_dir: Path) -> Client:
    with patch("light_audit.audit.views._pwa_root", return_value=pwa_dir):
        yield client


@pytest.mark.django_db
def test_pwa_index_returns_200(pwa_client: Client, pwa_dir: Path) -> None:
    with patch("light_audit.audit.views._pwa_root", return_value=pwa_dir):
        response = pwa_client.get("/audit/")
    assert response.status_code == 200  # noqa: PLR2004


@pytest.mark.django_db
def test_pwa_index_content_type_html(pwa_client: Client, pwa_dir: Path) -> None:
    with patch("light_audit.audit.views._pwa_root", return_value=pwa_dir):
        response = pwa_client.get("/audit/")
    assert "text/html" in response["Content-Type"]


@pytest.mark.django_db
def test_sw_js_no_cache(pwa_client: Client, pwa_dir: Path) -> None:
    with patch("light_audit.audit.views._pwa_root", return_value=pwa_dir):
        response = pwa_client.get("/audit/sw.js")
    assert response.status_code == 200  # noqa: PLR2004
    assert "no-cache" in response["Cache-Control"]


@pytest.mark.django_db
def test_sw_js_service_worker_allowed_header(pwa_client: Client, pwa_dir: Path) -> None:
    with patch("light_audit.audit.views._pwa_root", return_value=pwa_dir):
        response = pwa_client.get("/audit/sw.js")
    assert response["Service-Worker-Allowed"] == "/audit/"


@pytest.mark.django_db
def test_sw_js_content_type(pwa_client: Client, pwa_dir: Path) -> None:
    with patch("light_audit.audit.views._pwa_root", return_value=pwa_dir):
        response = pwa_client.get("/audit/sw.js")
    assert "javascript" in response["Content-Type"]


@pytest.mark.django_db
def test_manifest_json_content_type(pwa_client: Client, pwa_dir: Path) -> None:
    with patch("light_audit.audit.views._pwa_root", return_value=pwa_dir):
        response = pwa_client.get("/audit/manifest.json")
    assert response.status_code == 200  # noqa: PLR2004
    assert "json" in response["Content-Type"]


@pytest.mark.django_db
def test_icon_png_content_type(pwa_client: Client, pwa_dir: Path) -> None:
    with patch("light_audit.audit.views._pwa_root", return_value=pwa_dir):
        response = pwa_client.get("/audit/icons/icon-192.png")
    assert response.status_code == 200  # noqa: PLR2004
    assert "image/png" in response["Content-Type"]


@pytest.mark.django_db
def test_missing_asset_returns_404(pwa_client: Client, pwa_dir: Path) -> None:
    with patch("light_audit.audit.views._pwa_root", return_value=pwa_dir):
        response = pwa_client.get("/audit/does-not-exist.js")
    assert response.status_code == 404  # noqa: PLR2004


@pytest.mark.django_db
def test_pwa_not_built_returns_404(client: Client, tmp_path: Path) -> None:
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    with patch("light_audit.audit.views._pwa_root", return_value=empty_dir):
        response = client.get("/audit/")
    assert response.status_code == 404  # noqa: PLR2004
