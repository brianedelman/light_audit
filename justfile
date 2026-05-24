export COMPOSE_FILE := "docker-compose.local.yml"

## Just does not yet manage signals for subprocesses reliably, which can lead to unexpected behavior.
## Exercise caution before expanding its usage in production environments.
## For more information, see https://github.com/casey/just/issues/2473 .


# Default command to list all available commands.
default:
    @just --list

# build: Build python image.
build *args:
    @echo "Building python image..."
    @docker compose build {{args}}

# up: Start up containers.
up:
    @echo "Starting up containers..."
    @docker compose up -d --remove-orphans

# down: Stop containers.
down:
    @echo "Stopping containers..."
    @docker compose down

# prune: Remove containers and their volumes.
prune *args:
    @echo "Killing containers and removing volumes..."
    @docker compose down -v {{args}}

# logs: View container logs
logs *args:
    @docker compose logs -f {{args}}

# manage: Executes `manage.py` command.
manage +args:
    @docker compose run --rm django python ./manage.py {{args}}

# pytest: Run tests with pytest.
pytest *args:
    @docker compose run --rm django pytest {{args}}


# ---------------------------------------------------------------------------
# Local (non-Docker) commands. Run inside repo venv at .venv/.
# Uses sqlite by default; override DATABASE_URL in shell or .env to use postgres.
# ---------------------------------------------------------------------------

py := justfile_directory() + "/.venv/bin/python"

pg_user := "oWjSzHLlvhTXFCnZhKtCzHoiifDTxEdn"
pg_pass := "SNeE3x9ubGHiWjCvPBtvqgAO7ZHdEBxivGQcqXbzfQeVUy5XQZnS3A3AVvx7GqgT"
pg_db := "light_audit"
default_db_url := "postgres://" + pg_user + ":" + pg_pass + "@localhost:5433/" + pg_db

local-env := 'DJANGO_SETTINGS_MODULE=config.settings.local ' + \
    'USE_DOCKER=no ' + \
    'DATABASE_URL="${DATABASE_URL:-' + default_db_url + '}" ' + \
    'REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}" ' + \
    'CELERY_BROKER_URL="${CELERY_BROKER_URL:-redis://localhost:6379/0}" ' + \
    'DJANGO_SECRET_KEY="${DJANGO_SECRET_KEY:-dev-insecure-secret-key}"'

# db-up: Start postgres + redis containers only.
db-up:
    docker compose up -d postgres redis

# db-down: Stop postgres + redis containers.
db-down:
    docker compose stop postgres redis

# serve: Run Django dev server locally.
serve port="8001":
    {{local-env}} {{py}} manage.py runserver {{port}}

# migrate: Apply migrations.
migrate *args:
    {{local-env}} {{py}} manage.py migrate {{args}}

# makemigrations: Create migrations.
makemigrations *args:
    {{local-env}} {{py}} manage.py makemigrations {{args}}

# shell: Django shell.
shell:
    {{local-env}} {{py}} manage.py shell

# dbshell: Database shell.
dbshell:
    {{local-env}} {{py}} manage.py dbshell

# superuser: Create superuser.
superuser:
    {{local-env}} {{py}} manage.py createsuperuser

# check: Run Django system check.
check:
    {{local-env}} {{py}} manage.py check

# collectstatic: Collect static files.
collectstatic:
    {{local-env}} {{py}} manage.py collectstatic --noinput

# test: Run backend pytest + frontend vitest.
test:
    {{local-env}} {{py}} -m pytest
    cd frontend && npm run test

# test-backend: Run pytest locally.
test-backend *args:
    {{local-env}} {{py}} -m pytest {{args}}

# manage-local: Run arbitrary manage.py command locally.
manage-local *args:
    {{local-env}} {{py}} manage.py {{args}}

# reset-db: Drop + recreate postgres db and re-migrate.
reset-db:
    docker compose exec -T postgres dropdb -U {{pg_user}} --if-exists {{pg_db}}
    docker compose exec -T postgres createdb -U {{pg_user}} {{pg_db}}
    just migrate

# clean-pyc: Remove __pycache__ trees.
clean-pyc:
    find . -name __pycache__ -not -path "*/.venv/*" -exec rm -rf {} +

# celery: Run Celery worker locally.
celery:
    {{local-env}} {{py}} -m celery -A config.celery_app worker -l info

# celery-beat: Run Celery beat locally.
celery-beat:
    {{local-env}} {{py}} -m celery -A config.celery_app beat -l info

# ---------------------------------------------------------------------------
# Frontend commands. Run inside frontend/ directory.
# ---------------------------------------------------------------------------

# frontend-dev: Start Vite dev server.
frontend-dev:
    cd frontend && npm run dev

# frontend-build: Production build.
frontend-build:
    cd frontend && npm run build

# frontend-test: Run Vitest.
frontend-test:
    cd frontend && npm run test

# frontend-lint: Run ESLint.
frontend-lint:
    cd frontend && npm run lint
