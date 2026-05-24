#!/usr/bin/env bash
set -o errexit

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"

pip install uv
uv sync --frozen --no-dev

uv run python manage.py collectstatic --no-input
uv run python manage.py migrate
