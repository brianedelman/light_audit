from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse
from django.http import Http404
from django.http import HttpRequest
from django.http import HttpResponse

# Root of the bundled PWA output (created by `just html-app-build`)
_PWA_DIR = Path(settings.BASE_DIR) / "dist" / "audit-pwa"


def _pwa_root() -> Path:
    """Return the PWA output directory (allows easy patching in tests)."""
    return _PWA_DIR


def pwa_index(request: HttpRequest) -> FileResponse:
    """Serve dist/audit-pwa/index.html at /audit/."""
    index = _pwa_root() / "index.html"
    if not index.exists():
        msg = "PWA not built — run `just html-app-build`"
        raise Http404(msg)
    return FileResponse(index.open("rb"), content_type="text/html; charset=utf-8")


def pwa_asset(request: HttpRequest, asset_path: str) -> HttpResponse:
    """Serve static assets from dist/audit-pwa/ with correct MIME types and headers."""
    # Resolve the path safely — prevent directory traversal
    try:
        target = (_pwa_root() / asset_path).resolve()
        target.relative_to(_pwa_root().resolve())
    except ValueError:
        raise Http404  # noqa: B904

    if not target.exists() or not target.is_file():
        raise Http404

    mime_type, _ = mimetypes.guess_type(str(target))
    if mime_type is None:
        mime_type = "application/octet-stream"

    response = FileResponse(target.open("rb"), content_type=mime_type)

    if asset_path == "sw.js":
        # Service workers must not be cached and need the scope header
        response["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response["Service-Worker-Allowed"] = "/audit/"

    return response
