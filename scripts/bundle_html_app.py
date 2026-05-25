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


def bundle(html_dir: Path, output_path: Path) -> None:
    html_file = html_dir / "app.html"
    css_file = html_dir / "app.css"
    js_file = html_dir / "app.js"

    html = html_file.read_text(encoding="utf-8")

    # --- CSS ---
    # Match <link ... href="app.css" ...> (any attributes, any order)
    css_link_pattern = re.compile(
        r'<link\b[^>]*\bhref=["\']app\.css["\'][^>]*/?>',
        re.IGNORECASE,
    )
    if css_link_pattern.search(html):
        # Split-file: inline the CSS — use lambda to avoid re backslash interpretation
        css_content = css_file.read_text(encoding="utf-8")
        css_replacement = f"<style>\n{css_content}\n</style>"
        html = css_link_pattern.sub(lambda _: css_replacement, html)

    # --- JS ---
    # Match <script src="./app.js"> or <script src="app.js"> (with optional attrs)
    js_script_pattern = re.compile(
        r'<script\b[^>]*\bsrc=["\']\.?/?app\.js["\'][^>]*>\s*</script>',
        re.IGNORECASE,
    )
    if js_script_pattern.search(html):
        # Split-file: inline the JS — use lambda to avoid re backslash interpretation
        js_content = js_file.read_text(encoding="utf-8")
        js_replacement = f"<script>\n{js_content}\n</script>"
        html = js_script_pattern.sub(lambda _: js_replacement, html)

    # --- storage-shim.js ---
    shim_pattern = re.compile(
        r'<script\b[^>]*\bsrc=["\']\.?/?storage-shim\.js["\'][^>]*>\s*</script>',
        re.IGNORECASE,
    )
    shim_file = html_dir / "storage-shim.js"
    if shim_pattern.search(html) and shim_file.exists():
        shim_content = shim_file.read_text(encoding="utf-8")
        shim_replacement = f'<script type="module">\n{shim_content}\n</script>'
        html = shim_pattern.sub(lambda _: shim_replacement, html)

    # --- storage.js ---
    # Match <script type="module" src="./storage.js"> or <script src="./storage.js">
    storage_pattern = re.compile(
        r'<script\b[^>]*\bsrc=["\']\.?/?storage\.js["\'][^>]*>\s*</script>',
        re.IGNORECASE,
    )
    storage_file = html_dir / "storage.js"
    if storage_pattern.search(html) and storage_file.exists():
        storage_content = storage_file.read_text(encoding="utf-8")
        storage_replacement = f'<script type="module">\n{storage_content}\n</script>'
        html = storage_pattern.sub(lambda _: storage_replacement, html)

    # --- photo-store.js ---
    photo_store_pattern = re.compile(
        r'<script\b[^>]*\bsrc=["\']\.?/?photo-store\.js["\'][^>]*>\s*</script>',
        re.IGNORECASE,
    )
    photo_store_file = html_dir / "photo-store.js"
    if photo_store_pattern.search(html) and photo_store_file.exists():
        photo_store_content = photo_store_file.read_text(encoding="utf-8")
        photo_store_replacement = f'<script type="module">\n{photo_store_content}\n</script>'
        html = photo_store_pattern.sub(lambda _: photo_store_replacement, html)

    # --- compress.js ---
    compress_pattern = re.compile(
        r'<script\b[^>]*\bsrc=["\']\.?/?compress\.js["\'][^>]*>\s*</script>',
        re.IGNORECASE,
    )
    compress_file = html_dir / "compress.js"
    if compress_pattern.search(html) and compress_file.exists():
        compress_content = compress_file.read_text(encoding="utf-8")
        compress_replacement = f'<script type="module">\n{compress_content}\n</script>'
        html = compress_pattern.sub(lambda _: compress_replacement, html)

    # --- video-cap.js ---
    video_cap_pattern = re.compile(
        r'<script\b[^>]*\bsrc=["\']\.?/?video-cap\.js["\'][^>]*>\s*</script>',
        re.IGNORECASE,
    )
    video_cap_file = html_dir / "video-cap.js"
    if video_cap_pattern.search(html) and video_cap_file.exists():
        video_cap_content = video_cap_file.read_text(encoding="utf-8")
        video_cap_replacement = f'<script type="module">\n{video_cap_content}\n</script>'
        html = video_cap_pattern.sub(lambda _: video_cap_replacement, html)

    # --- sync-queue.js ---
    sync_queue_pattern = re.compile(
        r'<script\b[^>]*\bsrc=["\']\.?/?sync-queue\.js["\'][^>]*>\s*</script>',
        re.IGNORECASE,
    )
    sync_queue_file = html_dir / "sync-queue.js"
    if sync_queue_pattern.search(html) and sync_queue_file.exists():
        sync_queue_content = sync_queue_file.read_text(encoding="utf-8")
        sync_queue_replacement = f'<script type="module">\n{sync_queue_content}\n</script>'
        html = sync_queue_pattern.sub(lambda _: sync_queue_replacement, html)

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
