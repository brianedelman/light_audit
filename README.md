# light_audit

Light Audit Platform

[![Built with Cookiecutter Django](https://img.shields.io/badge/built%20with-Cookiecutter%20Django-ff69b4.svg?logo=cookiecutter)](https://github.com/cookiecutter/cookiecutter-django/)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)

## Settings

Moved to [settings](https://cookiecutter-django.readthedocs.io/en/latest/1-getting-started/settings.html).

## Basic Commands

### Setting Up Your Users

- To create a **normal user account**, just go to Sign Up and fill out the form. Once you submit it, you'll see a "Verify Your E-mail Address" page. Go to your console to see a simulated email verification message. Copy the link into your browser. Now the user's email should be verified and ready to go.

- To create a **superuser account**, use this command:

      uv run python manage.py createsuperuser

For convenience, you can keep your normal user logged in on Chrome and your superuser logged in on Firefox (or similar), so that you can see how the site behaves for both kinds of users.

### Type checks

Running type checks with mypy:

    uv run mypy light_audit

### Test coverage

To run the tests, check your test coverage, and generate an HTML coverage report:

    uv run coverage run -m pytest
    uv run coverage html
    uv run open htmlcov/index.html

#### Running tests with pytest

    uv run pytest

### Live reloading and Sass CSS compilation

Moved to [Live reloading and SASS compilation](https://cookiecutter-django.readthedocs.io/en/latest/2-local-development/developing-locally.html#using-webpack-or-gulp).

### Celery

This app comes with Celery.

To run a celery worker:

```bash
cd light_audit
uv run celery -A config.celery_app worker -l info
```

Please note: For Celery's import magic to work, it is important _where_ the celery commands are run. If you are in the same folder with _manage.py_, you should be right.

To run [periodic tasks](https://docs.celeryq.dev/en/stable/userguide/periodic-tasks.html), you'll need to start the celery beat scheduler service. You can start it as a standalone process:

```bash
cd light_audit
uv run celery -A config.celery_app beat
```

or you can embed the beat service inside a worker with the `-B` option (not recommended for production use):

```bash
cd light_audit
uv run celery -A config.celery_app worker -B -l info
```

### Email Server

In development, it is often nice to be able to see emails that are being sent from your application. For that reason local SMTP server [Mailpit](https://github.com/axllent/mailpit) with a web interface is available as docker container.

Container mailpit will start automatically when you will run all docker containers.
Please check [cookiecutter-django Docker documentation](https://cookiecutter-django.readthedocs.io/en/latest/2-local-development/developing-locally-docker.html) for more details how to start all containers.

With Mailpit running, to view messages that are sent by your application, open your browser and go to `http://127.0.0.1:8025`

## Deployment

### Render

The app deploys to [Render](https://render.com) via `render.yaml` (Infrastructure-as-Code).

**Services provisioned:**

| Service | Type | Start command |
|---------|------|---------------|
| `lightaudit` | Web (ASGI) | `gunicorn config.asgi:application -k uvicorn_worker.UvicornWorker` |
| `lightaudit-celeryworker` | Worker | `celery -A config.celery_app worker -l INFO` |
| `lightaudit-celerybeat` | Worker | `celery -A config.celery_app beat -l INFO` |
| `lightaudit-db` | Managed Postgres | — |
| `lightaudit-redis` | Key-Value (Redis) | — |

**Build process** (`build.sh`): installs Python deps via uv, installs Node 22 via nvm, builds React frontend + PWA bundle, runs collectstatic + migrate.

**pgvector note:** The `vector` extension (used for KnowledgeDoc embeddings) requires Render's Standard or higher Postgres plan. The Django migration `0002_enable_pgvector` runs `CREATE EXTENSION IF NOT EXISTS vector` automatically.

#### Required Environment Variables

Set these in the Render dashboard (marked `sync: false` in render.yaml):

| Variable | Description |
|----------|-------------|
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames, e.g. `lightaudit.onrender.com,yourdomain.com` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Full origins, e.g. `https://yourdomain.com` |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Full origins for CORS |
| `FRONTEND_URL` | Base URL for password reset email links, e.g. `https://yourdomain.com` |
| `R2_ACCOUNT_ID` | Cloudflare account ID for R2 storage |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | R2 bucket name (default: `light-audit-media`) |
| `R2_PUBLIC_URL` | Public URL for R2 bucket (e.g. CDN domain) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude audit review |
| `DJANGO_AWS_ACCESS_KEY_ID` | AWS/S3 access key (used by django-storages for media) |
| `DJANGO_AWS_SECRET_ACCESS_KEY` | AWS/S3 secret key |
| `DJANGO_AWS_STORAGE_BUCKET_NAME` | S3 bucket for media storage |
| `DJANGO_AWS_S3_REGION_NAME` | S3 region |
| `MAILGUN_API_KEY` | Mailgun API key for transactional email |
| `MAILGUN_DOMAIN` | Mailgun sender domain |
| `DJANGO_DEFAULT_FROM_EMAIL` | Default "from" address for emails |
| `DJANGO_SERVER_EMAIL` | Server error notification sender |

**Auto-generated** (set by render.yaml): `DJANGO_SECRET_KEY`, `DJANGO_ADMIN_URL`, `DATABASE_URL`, `REDIS_URL`, `CELERY_BROKER_URL`.

#### Custom Domain + HTTPS

1. Add custom domain in Render dashboard → Settings → Custom Domains
2. Configure DNS CNAME to point to `lightaudit.onrender.com`
3. Render provisions TLS certificates automatically
4. Update `DJANGO_ALLOWED_HOSTS` and `DJANGO_CSRF_TRUSTED_ORIGINS` with the new domain
5. Update `FRONTEND_URL` to use the custom domain

#### Smoke Test

After deploy, verify:
1. `GET /api/auth/me/` returns 401 (unauthenticated)
2. `POST /api/auth/login/` with valid credentials returns 200
3. `GET /projects` serves the React SPA
4. `GET /audit/` serves the PWA

### Docker

See detailed [cookiecutter-django Docker documentation](https://cookiecutter-django.readthedocs.io/en/latest/3-deployment/deployment-with-docker.html).
