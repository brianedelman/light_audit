#!/usr/bin/env python3
"""Bundle html_app/app.html into dist/audit-pwa/index.html.

Split-file mode: replaces <link href="app.css"> with inlined <style> and
<script src="./app.js"> with inlined <script>.

Single-file mode: passes through unchanged when app.html already has inline
<style> / <script> for the app content.

Also copies manifest.json and icons/ to the output directory.
"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path


def _inline_module(html: str, html_dir: Path, filename: str) -> str:
    """Inline a <script src="./filename"> as a <script type="module"> block."""
    pattern = re.compile(
        rf'<script\b[^>]*\bsrc=["\']\.?/?{re.escape(filename)}["\'][^>]*>\s*</script>',
        re.IGNORECASE,
    )
    src_file = html_dir / filename
    if pattern.search(html) and src_file.exists():
        content = src_file.read_text(encoding="utf-8")
        replacement = (
            f'<script type="module">\n{content}\n</script>'
        )
        html = pattern.sub(lambda _: replacement, html)
    return html


def bundle(html_dir: Path, output_path: Path) -> None:
    html_file = html_dir / "app.html"
    css_file = html_dir / "app.css"
    js_file = html_dir / "app.js"

    html = html_file.read_text(encoding="utf-8")

    # --- CSS ---
    css_link_pattern = re.compile(
        r'<link\b[^>]*\bhref=["\']app\.css["\'][^>]*/?>',
        re.IGNORECASE,
    )
    if css_link_pattern.search(html):
        css_content = css_file.read_text(encoding="utf-8")
        css_replacement = f"<style>\n{css_content}\n</style>"
        html = css_link_pattern.sub(lambda _: css_replacement, html)

    # --- JS (app.js — plain script, not module) ---
    js_script_pattern = re.compile(
        r'<script\b[^>]*\bsrc=["\']\.?/?app\.js["\'][^>]*>\s*</script>',
        re.IGNORECASE,
    )
    if js_script_pattern.search(html):
        js_content = js_file.read_text(encoding="utf-8")
        js_replacement = f"<script>\n{js_content}\n</script>"
        html = js_script_pattern.sub(lambda _: js_replacement, html)

    # --- ES module scripts ---
    module_files = [
        "storage-shim.js",
        "storage.js",
        "photo-store.js",
        "compress.js",
        "video-cap.js",
        "sync-queue.js",
        "sync-drain.js",
    ]
    for mod in module_files:
        html = _inline_module(html, html_dir, mod)

    output_dir = output_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")

    # Copy manifest.json if present
    manifest_src = html_dir / "manifest.json"
    if manifest_src.exists():
        shutil.copy2(manifest_src, output_dir / "manifest.json")

    # Copy sw.js if present
    sw_src = html_dir / "sw.js"
    if sw_src.exists():
        shutil.copy2(sw_src, output_dir / "sw.js")

    # Copy icons/ directory if present
    icons_src = html_dir / "icons"
    if icons_src.is_dir():
        icons_dst = output_dir / "icons"
        if icons_dst.exists():
            shutil.rmtree(icons_dst)
        shutil.copytree(icons_src, icons_dst)

    sys.stdout.write(f"Bundled → {output_path}\n")


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    html_dir = Path(args[0]) if args else Path(__file__).parent.parent / "html_app"
    output_path = (
        Path(args[1])
        if len(args) > 1
        else Path(__file__).parent.parent / "dist" / "audit-pwa" / "index.html"
    )
    bundle(html_dir, output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
