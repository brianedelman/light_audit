"""Tests for scripts/bundle_html_app.py."""
from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from pathlib import Path

from scripts.bundle_html_app import bundle

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SPLIT_HTML = """\
<!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" type="text/css" href="app.css" media="screen" />
</head>
<body>
<div>Hello</div>
<script src="./app.js"></script>
</body>
</html>
"""

SPLIT_CSS = "body { color: red; }"
SPLIT_JS = "console.log('hello');"

SINGLE_HTML = """\
<!DOCTYPE html>
<html>
<head>
<style>
body { color: blue; }
</style>
</head>
<body>
<div>Hello</div>
<script>
console.log('world');
</script>
</body>
</html>
"""


@pytest.fixture
def split_dir(tmp_path: Path) -> Path:
    """html_app dir with split files."""
    (tmp_path / "app.html").write_text(SPLIT_HTML, encoding="utf-8")
    (tmp_path / "app.css").write_text(SPLIT_CSS, encoding="utf-8")
    (tmp_path / "app.js").write_text(SPLIT_JS, encoding="utf-8")
    return tmp_path


@pytest.fixture
def single_dir(tmp_path: Path) -> Path:
    """html_app dir that is already a single file."""
    (tmp_path / "app.html").write_text(SINGLE_HTML, encoding="utf-8")
    return tmp_path


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_split_file_css_inlined(split_dir: Path, tmp_path: Path) -> None:
    out = tmp_path / "out" / "index.html"
    bundle(split_dir, out)
    content = out.read_text(encoding="utf-8")
    assert "<style>" in content
    assert SPLIT_CSS in content
    # original link tag removed
    assert 'href="app.css"' not in content


def test_split_file_js_inlined(split_dir: Path, tmp_path: Path) -> None:
    out = tmp_path / "out" / "index.html"
    bundle(split_dir, out)
    content = out.read_text(encoding="utf-8")
    assert "<script>" in content
    assert SPLIT_JS in content
    # original script src removed
    assert 'src="./app.js"' not in content


def test_split_file_output_created(split_dir: Path, tmp_path: Path) -> None:
    out = tmp_path / "dist" / "audit-pwa" / "index.html"
    bundle(split_dir, out)
    assert out.exists()


def test_split_file_preserves_other_content(split_dir: Path, tmp_path: Path) -> None:
    out = tmp_path / "out" / "index.html"
    bundle(split_dir, out)
    content = out.read_text(encoding="utf-8")
    assert "<div>Hello</div>" in content
    assert "<!DOCTYPE html>" in content


def test_single_file_passthrough(single_dir: Path, tmp_path: Path) -> None:
    out = tmp_path / "out" / "index.html"
    bundle(single_dir, out)
    content = out.read_text(encoding="utf-8")
    # original inline style preserved
    assert "body { color: blue; }" in content
    assert "console.log('world');" in content
    # no link/script-src remnants
    assert 'href="app.css"' not in content
    assert 'src="./app.js"' not in content


def test_single_file_identical_output(single_dir: Path, tmp_path: Path) -> None:
    out = tmp_path / "out" / "index.html"
    bundle(single_dir, out)
    assert out.read_text(encoding="utf-8") == SINGLE_HTML


def test_output_dir_created_automatically(split_dir: Path, tmp_path: Path) -> None:
    out = tmp_path / "a" / "b" / "c" / "index.html"
    bundle(split_dir, out)
    assert out.exists()


def test_manifest_copied(split_dir: Path, tmp_path: Path) -> None:
    (split_dir / "manifest.json").write_text('{"name":"Test"}', encoding="utf-8")
    out = tmp_path / "out" / "index.html"
    bundle(split_dir, out)
    assert (tmp_path / "out" / "manifest.json").exists()
    assert (tmp_path / "out" / "manifest.json").read_text() == '{"name":"Test"}'


def test_icons_copied(split_dir: Path, tmp_path: Path) -> None:
    icons = split_dir / "icons"
    icons.mkdir()
    (icons / "icon-192.png").write_bytes(b"fake-png-192")
    (icons / "icon-512.png").write_bytes(b"fake-png-512")
    out = tmp_path / "out" / "index.html"
    bundle(split_dir, out)
    assert (tmp_path / "out" / "icons" / "icon-192.png").read_bytes() == b"fake-png-192"
    assert (tmp_path / "out" / "icons" / "icon-512.png").read_bytes() == b"fake-png-512"


def test_no_manifest_no_error(split_dir: Path, tmp_path: Path) -> None:
    out = tmp_path / "out" / "index.html"
    bundle(split_dir, out)  # no manifest.json in split_dir
    assert not (tmp_path / "out" / "manifest.json").exists()


def test_sw_copied(split_dir: Path, tmp_path: Path) -> None:
    (split_dir / "sw.js").write_text("// sw", encoding="utf-8")
    out = tmp_path / "out" / "index.html"
    bundle(split_dir, out)
    assert (tmp_path / "out" / "sw.js").read_text() == "// sw"


def test_script_src_without_dot_slash(tmp_path: Path) -> None:
    """<script src="app.js"> (no leading ./) also gets inlined."""
    html = '<script src="app.js"></script>'
    (tmp_path / "app.html").write_text(html, encoding="utf-8")
    (tmp_path / "app.css").write_text("", encoding="utf-8")
    (tmp_path / "app.js").write_text("var x = 1;", encoding="utf-8")
    out = tmp_path / "out.html"
    bundle(tmp_path, out)
    content = out.read_text(encoding="utf-8")
    assert "var x = 1;" in content
    assert 'src="app.js"' not in content
