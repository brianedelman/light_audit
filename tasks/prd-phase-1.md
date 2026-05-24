# PRD: Light Audit Platform — Phase 1

## 1. Introduction/Overview

Phase 1 delivers a working internal platform for the Digital Energy Team to (a) capture lighting audit data in the field via an offline-capable PWA, (b) sync that data to a hosted web app, and (c) run AI-assisted audit reviews against the collected data. Existing single-file HTML audit tool (`html_app/`) is migrated into a PWA with IndexedDB + service worker background sync, and a new Django + React web app provides the review dashboard, Anthropic API integration (streaming chat + audit review agent), and project landing pages with versioned audits pushable back to iPad.

Out of scope this phase: spec/solutions engine, catalog search UI, Kanban PM dashboard, multi-tenancy, billing, mobile native app.

## 2. Goals

- Existing HTML audit tool deployed as installable PWA on iPad with full offline capability.
- Audit data + media (photos, short videos, panoramas) sync from PWA to hosted Django backend.
- 200+ images per building supported via Cloudflare R2 with client-side compression, resumable uploads, thumbnails.
- Postgres schema with pgvector enabled, covering audit data (buildings → floors → rooms → log entries) and media metadata.
- Web dashboard: project landing → buildings → audit versions → room-by-room review with photos + table data.
- Audit Review interface: predefined prompts + iterative chat against Claude; output = annotated spreadsheet (red flags + new columns) + narrative document. Streaming responses via Django Channels.
- Versioning: new audit versions saved on web, pushable to iPad PWA.
- Dismissible flags persisted with reasoning so agent can learn dismissal context on re-run.
- Project-level chatbot for status/client queries.
- All Claude API calls logged input/output for auditability.
- Auth: Django built-in, email/password, 2–3 internal users seeded manually.

## 3. User Stories

### US-001: Bootstrap gaps on top of existing scaffold
**Description:** Repo already has cookiecutter-django scaffold: `config/` settings + ASGI + `celery_app.py`, `light_audit/audit/` app with initial `models.py` + migration `0001_initial.py`, Docker compose (`docker-compose.local.yml`) with Django, Postgres, Redis, mailpit, celeryworker, celerybeat, flower, `pyproject.toml` w/ uv, `justfile`, pre-commit, render.yaml. Missing pieces only: pgvector, Channels wiring, frontend folder, R2 settings, CI test gates.

**Acceptance Criteria:**
- [ ] Postgres image swapped to `pgvector/pgvector:pg16` (or extension installed in current image); Django migration runs `CREATE EXTENSION IF NOT EXISTS vector`
- [ ] `django-channels` + `channels-redis` added; `config/asgi.py` wired with `ProtocolTypeRouter` + `AuthMiddlewareStack` + Redis channel layer; routing module created (consumers added per chat stories)
- [ ] `frontend/` already scaffolded (Vite + React 19 + TypeScript + ESLint). Add: TanStack Query, TanStack Table, TanStack Router (or React Router), Vitest + @testing-library/react, Tailwind (optional), axios or fetch wrapper, WebSocket client helper
- [ ] `vite.config.ts` proxies `/api` + `/ws` to Django dev server
- [ ] Frontend production build (`npm run build`) output collected/served by Django (whitenoise) or routed via reverse proxy in `render.yaml`
- [ ] `npm run test` (Vitest) wired and passing on starter test
- [ ] Cloudflare R2 env vars + `django-storages` (S3 backend) settings added to `config/settings/base.py` (no functional usage yet — wired in US-009)
- [ ] `justfile` recipes added: `just frontend-dev`, `just frontend-build`, `just frontend-test`, `just test` (runs both)
- [ ] CI (`.github/workflows/`) runs backend pytest + frontend vitest; both must pass
- [ ] Backend tests pass (`pytest`), frontend tests pass (`vitest`), lint passes (ruff + eslint)
- [ ] README updated with frontend setup steps

### US-002: Audit schema additions on existing models
**Description:** `light_audit/audit/models.py` already defines `Building`, `Floor`, `FloorPlan`, `FloorPlanPin`, `LightLevelReading`, `Room`, `RoomPhoto`, `RoomNote`, `LogEntry`, `CatalogProduct`, `CatalogModifier`, `ProductAccessory`, `SpecItem`. Phase 1 adds Project grouping, audit versioning, ownership tracking, and a deferred-but-reserved `KnowledgeDoc`.

**Acceptance Criteria:**
- [ ] New `Project` model: name, client, building_type, status, created_at, updated_at, owner FK to User
- [ ] `Building` gains `project = FK(Project, related_name='buildings')`; existing `client` field migrated onto Project
- [ ] New `AuditVersion` model: building FK, version_number (auto-increment per building), label, created_by FK to User, created_at, status ('draft'|'published'|'pushed_to_ipad'), source_payload JSON (raw PWA submission), is_current bool
- [ ] Snapshot semantics: log_entries/rooms/floors carry `audit_version` FK; published versions immutable (enforced via `clean()` + admin guard)
- [ ] `created_at`, `updated_at`, `user_id` (or `created_by`) added to remaining audit tables that lack them (`Room`, `Floor`, `LogEntry` already partial — fill gaps)
- [ ] `KnowledgeDoc` model (schema only, no ingest): title, source_path, chunk_text, embedding `VectorField(dimensions=1536)` via `pgvector.django`
- [ ] Migrations generate + apply cleanly; no destructive drops on existing rows (use defaults / data migration where needed)
- [ ] Pytest covers: AuditVersion FK cascade, published-version immutability, Project↔Building relationship
- [ ] Backend tests pass, lint passes

### US-003: Database schema — media + flags + agent logs
**Description:** As developer, I need media metadata, dismissible flags, and Claude call logs tables.

**Acceptance Criteria:**
- [ ] `Photo` model: building_id, floor_id, space_name, photo_type ('fixture'|'switch'|'controls'|'panorama'|'video'), storage_path, public_url, thumbnail_url, file_size_bytes, mime_type, width, height, duration_seconds, taken_at, uploaded_at, user_id, log_entry_id FK, notes
- [ ] `AuditFlag` model: log_entry_id FK, audit_version_id FK, severity, message, status ('active'|'dismissed'), dismissed_reason, dismissed_by, dismissed_at, source_run_id
- [ ] `AgentRun` model: agent_type ('audit_review'|'chatbot'), user_id, project_id, prompt_input (JSON), response_output (JSON), tokens_in, tokens_out, started_at, finished_at, status, error
- [ ] pgvector column reserved on a placeholder `KnowledgeDoc` table (schema only, no ingest yet)
- [ ] Typecheck passes

### US-004: Auth — internal users
**Description:** As internal user, I want email/password login to access the dashboard.

**Acceptance Criteria:**
- [ ] Django built-in auth; email used as username
- [ ] Login + logout views (React + DRF token / session auth)
- [ ] Password reset flow: request reset → email link → set new password (Django `PasswordResetView` + DRF endpoints; React pages for request + confirm)
- [ ] Reset emails delivered via SMTP (mailpit in dev, configurable backend in prod)
- [ ] All API endpoints require auth
- [ ] Backend + frontend tests pass; lint passes

### US-005: PWA — installable + offline shell (with html_app bundler)
**Description:** Existing `html_app/` is split into `app.html`, `app.css`, `app.js` for readability but the upstream/client deliverable is still treated as a single HTML file that may be replaced wholesale at any time. Build pipeline must (a) accept the split files as source of truth, (b) bundle into a single self-contained HTML for PWA delivery, AND (c) tolerate a future drop-in single-file replacement of `app.html` without breaking the pipeline.

**Acceptance Criteria:**
- [ ] Bundler script (Node or Python) inlines `app.css` + `app.js` into `app.html` → emits `dist/audit-pwa/index.html`
- [ ] If `app.html` already contains inline `<style>`/`<script>` (single-file form), bundler passes it through unchanged
- [ ] `manifest.json`, service worker (`sw.js`), iOS install meta tags, app icons emitted alongside `index.html`
- [ ] Service worker caches all PWA assets (cache-first with version-stamped cache key) for full offline boot
- [ ] PWA served by Django at `/audit/` route (or dedicated subdomain) with correct headers (`Service-Worker-Allowed`, no aggressive HTML caching)
- [ ] `just html-app-build` recipe; watcher recipe `just html-app-watch` for local dev
- [ ] Re-running bundler after any of `app.html`/`app.css`/`app.js` changes produces deterministic output
- [ ] Lighthouse PWA audit passes installable criteria on built output
- [ ] Frontend tests cover bundler (split-file input AND single-file input)
- [ ] Verify in browser using dev-browser skill (desktop install + iPad simulator).

### US-006: PWA — IndexedDB persistence (replace localStorage)
**Description:** As field auditor, I want audit data persisted in IndexedDB so I can hold 200+ images per building without localStorage limits.

**Acceptance Criteria:**
- [ ] All audit JSON data persisted in IndexedDB (migrate from localStorage on first load)
- [ ] Media (photos/videos) stored as Blobs in IndexedDB, not base64 in JSON
- [ ] App handles ≥200 photo blobs per building without crashing iPad Safari
- [ ] Existing localStorage data auto-migrates on first run; no data loss
- [ ] Frontend tests cover IndexedDB layer + migration path

### US-007: PWA — client-side media compression
**Description:** As field auditor, I want photos compressed on capture so storage + upload stay fast.

**Acceptance Criteria:**
- [ ] Photos resized via canvas to max 2–3MB before storing in IndexedDB
- [ ] Videos capped at 30s; rejected with message if longer
- [ ] Panoramas (≥50MB) stored as-is, flagged as `panorama` type
- [ ] EXIF timestamp extracted and retained
- [ ] Frontend tests cover compression + video length guard

### US-008: PWA — background sync queue
**Description:** As field auditor on spotty connectivity, I want changes queued and uploaded automatically when connectivity returns.

**Acceptance Criteria:**
- [ ] Service worker registers background sync queue
- [ ] Audit data changes + media uploads enqueued offline
- [ ] On connectivity, queue drains to Django API
- [ ] Resumable uploads via R2 S3 multipart (5MB+ parts, presigned per-part URLs, resume via `ListParts`)
- [ ] Failed uploads retry with exponential backoff; surfaced in UI status
- [ ] Conflict policy: PWA sync creates new `AuditVersion` if base version differs
- [ ] Frontend tests cover queue persistence, retry, drain

### US-009: Cloudflare R2 media storage
**Description:** As developer, I need R2 wired for media with thumbnails + CDN caching.

**Acceptance Criteria:**
- [ ] R2 bucket configured; Django uses S3-compatible client (boto3 with R2 endpoint)
- [ ] Path hierarchy: `project-media/{building_id}/{floor_id}/{room_name}/{filename}`
- [ ] Upload endpoint issues presigned URLs for direct PWA → R2 upload
- [ ] Celery task generates 300×300 thumbnail on upload completion; writes `thumbnail_url`
- [ ] R2 public bucket fronted by Cloudflare CDN; cache headers 30+ days for completed-audit media
- [ ] `Photo` row created after successful upload via callback
- [ ] Backend tests pass (mock R2 client); lint passes

### US-010: Sync API — PWA ↔ backend
**Description:** As developer, I need REST endpoints for PWA to push audit JSON and pull existing versions.

**Acceptance Criteria:**
- [ ] `POST /api/audits/sync` accepts full audit payload; creates `AuditVersion` snapshot
- [ ] `GET /api/projects/{id}/audits` lists versions
- [ ] `GET /api/audits/{version_id}` returns full version payload for PWA hydration
- [ ] Endpoints idempotent on client-supplied UUIDs
- [ ] Schema validated server-side (DRF serializers)
- [ ] Backend tests cover sync round-trip + idempotency; lint passes

### US-011: Project landing page
**Description:** As internal user, I want a landing page listing projects and their buildings/audit versions.

**Acceptance Criteria:**
- [ ] `/projects` lists all projects
- [ ] Project detail shows buildings, each with audit version list (timestamp, author, status)
- [ ] "Push to iPad" action marks version as pushable; PWA pull endpoint returns it
- [ ] "New version from this" duplicates an existing version
- [ ] Built with TanStack Query (data) + TanStack Table (version list)
- [ ] Frontend + backend tests pass; lint passes

### US-012: Audit review dashboard — room view
**Description:** As reviewer, I want to view audit data room-by-room with photos + tabular log entries.

**Acceptance Criteria:**
- [ ] Building → floor → room navigation
- [ ] Room view shows log entries table (read-only) + photo thumbnail grid
- [ ] Clicking thumbnail opens full-resolution lightbox
- [ ] Panoramas open in Pannellum or Photo Sphere Viewer
- [ ] Flags from `AuditFlag` rendered inline on log entry rows; severity-color-coded
- [ ] Dismiss button on each flag → modal asks for reason → flag `status='dismissed'` persisted with reason
- [ ] Log entries rendered via TanStack Table; data fetched via TanStack Query
- [ ] Frontend + backend tests pass; lint passes
- [ ] Verify in browser using dev-browser skill

### US-013: Audit review agent — streaming chat
**Description:** As reviewer, I want predefined prompts + freeform chat against Claude that streams responses and produces annotated outputs.

**Acceptance Criteria:**
- [ ] Audit review page has chat panel with prompt dropdown (predefined prompts seeded; content TBD, just plumbing required)
- [ ] Submitting prompt fires Celery task that calls Claude API with audit data context
- [ ] Streaming response delivered to frontend via Django Channels WebSocket
- [ ] Iterative follow-ups in same session refine output; conversation history maintained in `AgentRun`
- [ ] Output renders: (a) audit spreadsheet table with added columns + red-flag column; (b) narrative text doc explaining flags
- [ ] Spreadsheet exportable as CSV/XLSX; narrative exportable as .docx
- [ ] Flags written to `AuditFlag` table on run completion
- [ ] Dismissed flags' reasons included in subsequent prompt context (agent learns dismissals)
- [ ] All Claude calls logged via `AgentRun`
- [ ] Backend tests mock Anthropic SDK + assert AgentRun row created + flags persisted
- [ ] Frontend tests cover WebSocket consumer + streaming render
- [ ] Lint passes
- [ ] Verify in browser using dev-browser skill

### US-014: Project chatbot
**Description:** As internal user, I want a persistent chatbot on project pages for project-level questions (status, client info).

**Acceptance Criteria:**
- [ ] Chat panel on project landing + project detail pages
- [ ] Scoped to project metadata only (not technical spec)
- [ ] Streaming via Channels; logged via `AgentRun` with `agent_type='chatbot'`
- [ ] Backend + frontend tests pass; lint passes
- [ ] Verify in browser using dev-browser skill

### US-015: Deployment
**Description:** As internal user, I want platform accessible at custom domain.

**Acceptance Criteria:**
- [ ] Django + Channels deployed (Fly.io / Render / equivalent) with ASGI + Celery workers
- [ ] Postgres with pgvector provisioned (managed)
- [ ] Redis provisioned
- [ ] React frontend built + served (same host or Vercel)
- [ ] Cloudflare R2 + CDN live
- [ ] PWA deployed at custom domain, installable on iPad
- [ ] HTTPS enforced
- [ ] Env vars + secrets documented
- [ ] Backend + frontend test suites pass in CI on deploy branch

### US-016: html_app data-sync alignment review
**Description:** As stakeholder, I need confirmation that the JSON payload `html_app/` emits during sync actually matches what the backend + audit-review workflow need. Focus is data shape/coverage, not code quality of the HTML tool.

**Acceptance Criteria:**
- [ ] Markdown report at `docs/html-app-data-sync-review.md`
- [ ] Enumerate every field the PWA currently emits in its sync payload (from `app.js`)
- [ ] Map each field to a Django model field (or flag as unmapped / lossy / ambiguous)
- [ ] Identify fields the backend/review workflow needs but PWA does not emit (and proposed source: derive, capture, or punt)
- [ ] Identify fields PWA emits that nothing downstream consumes (candidates to drop or defer)
- [ ] Flag fields whose shape will block Phase 2 spec engine (e.g. fixture identification, control strategy, room-type tagging)
- [ ] Recommendations: minimal PWA changes needed for Phase 1 sync to be useful end-to-end

- FR-1: Django project with Postgres (pgvector), Redis, Celery, Channels, Docker dev compose.
- FR-2: React frontend lives in `frontend/` folder in same repo. Vite + React 19 + TypeScript + ESLint already scaffolded. Add TanStack Query/Table/Router + Vitest + Testing Library. Served via Django (whitenoise) or static host in prod.
- FR-3: Schema covering Project, Building, Floor, Room, LogEntry, AuditVersion, Photo, AuditFlag, AgentRun, KnowledgeDoc (pgvector column reserved).
- FR-4: Django built-in auth, email/password, seeded users (2–3); all APIs auth-gated.
- FR-5: `html_app/` (split files `app.html`/`app.css`/`app.js`) bundled into single self-contained HTML for PWA delivery; pipeline accepts future single-file drop-in replacements. Served as installable PWA with manifest + service worker; iOS installable.
- FR-6: PWA data + media persisted in IndexedDB (replaces localStorage). Media stored as Blobs.
- FR-7: Photos compressed client-side to 2–3MB; videos capped at 30s.
- FR-8: Service worker background sync queue with resumable uploads to R2; retry w/ backoff.
- FR-9: Cloudflare R2 storage; presigned upload URLs; Celery thumbnail generation; CDN caching.
- FR-10: Sync API endpoints — push audit version, list versions, pull version, push-to-iPad marker.
- FR-11: Project landing pages — list projects, buildings, audit versions; create new version from existing.
- FR-12: Room-view dashboard — log entries table + photo grid + lightbox + panorama viewer (Pannellum).
- FR-13: Flag rendering on log entries; dismiss with reason persisted; dismissed reasons injected into subsequent agent prompts.
- FR-14: Audit review agent — predefined prompts + freeform chat; Celery + Claude; streaming via Channels; outputs annotated spreadsheet + narrative doc; exports CSV/XLSX/.docx.
- FR-15: Project chatbot — scope-limited to project metadata; streaming via Channels.
- FR-16: All Claude calls logged via `AgentRun` (inputs, outputs, tokens, status).
- FR-17: Deployment at custom domain with HTTPS, managed Postgres/Redis, R2 + CDN.
- FR-18: html_app data-sync alignment review deliverable as `docs/html-app-data-sync-review.md` (focus on payload↔schema fit, not code quality).
- FR-19: CI gates: backend pytest + frontend vitest must both pass for merge.

## 5. Non-Goals (Out of Scope)

- Spec/solutions engine (spec_rules, spec_examples, manufacturer_defaults ingest, catalog modifier assembly).
- Catalog product search UI + accessory panel.
- Kanban PM dashboard + stage triggers.
- Multi-tenant / customer-facing architecture.
- Subscription billing.
- Native iOS/Android app.
- M&V / post-installation tracking.
- Utility bill integration.
- Auto-polygon room shapes from PDF (Phase 2 nice-to-have).
- Catalog + reference data import scripts (schema only; ingest deferred to Phase 2).
- Branded / polished UI (Phase 2).
- Knowledge doc ingest + semantic search (column reserved, no ingest).

## 6. Design Considerations

- React + Django REST API; frontend in `frontend/` folder in same repo. TanStack Query for server state, TanStack Table for grids, TanStack Router (or React Router) for routing. Tailwind acceptable; visual polish is Phase 2.
- Audit review page layout follows Figma overview (room list left, photos + table center, chat panel right).
- Pannellum or Photo Sphere Viewer for 360° media; do not serve raw equirectangular images directly.
- Reuse existing `html_app/` UI as PWA — no UI rewrite this phase. Bundler treats split files as source and single-file as fallback to absorb upstream drops.

## 7. Technical Considerations

- pgvector extension installed at migration time; reserved column on KnowledgeDoc table only.
- Django Channels + Redis channel layer for streaming Claude output to React via WebSocket.
- Celery for: Claude API calls, thumbnail generation, export rendering (.docx/.xlsx).
- Cloudflare R2 via S3-compatible boto3 client; presigned URL uploads direct from PWA.
- Resumable uploads via R2 native S3 multipart upload (presigned URLs per part; client tracks part list to resume).
- IndexedDB Blob storage in PWA (not base64). Use a wrapper library (idb-keyval or Dexie) if convenient.
- Service worker background sync API (with fallback to in-app polling on iOS Safari, since iOS lacks full Background Sync API).
- Conflict resolution: PWA sync always creates new `AuditVersion`; web edits never silently overwrite field data. "Push to iPad" is explicit.
- `AgentRun` log entries are required for every Claude call — wrap SDK to enforce.
- Anthropic SDK with prompt caching enabled for repeated audit-data context across iterative chat turns.

## 8. Success Metrics

- iPad PWA holds 200+ photos for a single building without crash.
- Field sync completes within 10 minutes of regaining connectivity for a typical (~450MB) survey.
- Audit review chat streams first token in under 3s.
- Reviewer can dismiss a flag in ≤2 clicks; dismissal reason persists across new agent runs.
- 100% of Claude calls have matching `AgentRun` records.
- Platform reachable at custom domain; 2–3 internal users can log in and complete review of a sample audit.

## 9. Decisions + Remaining Questions

**Decided:**
- iOS Safari background sync: in-app retry queue while PWA open (no Background Sync API dependency).
- Resumable uploads: R2 native S3 multipart upload (no TUS proxy). Client `CreateMultipartUpload` → upload 5MB+ parts with presigned PUT URLs → `ListParts` to resume after drop → `CompleteMultipartUpload`. Avoids running a `tusd` sidecar.
- Narrative doc export: `.docx` via `python-docx` (direct templating, not Markdown→docx pipeline).
- "Push to iPad" semantics: marks version available; PWA shows "new version from web" notification on next online open; auditor explicitly taps "load v3" to replace local state. No silent overwrite.
- Auth: password reset flow included in US-004 (email-based, Django's built-in PasswordResetView; mailpit in dev, real SMTP/SES in prod).

**Open:**
- Predefined prompt set — content provided by client later; placeholder prompts in seed data acceptable for Phase 1.
- Timeline: client targets 30–40 days; scope above is aggressive — flag tradeoffs early if at risk.
