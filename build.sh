#!/usr/bin/env bash
set -o errexit

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"

# ---------- Python dependencies ----------
pip install uv
uv sync --frozen --no-dev

# ---------- Node.js + frontend build ----------
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22
nvm use 22

cd frontend
npm ci --production=false
npm run build
cd ..

# ---------- HTML app (PWA) bundle ----------
uv run python scripts/bundle_html_app.py

# ---------- Django static + migrations ----------
uv run python manage.py collectstatic --no-input
uv run python manage.py migrate
