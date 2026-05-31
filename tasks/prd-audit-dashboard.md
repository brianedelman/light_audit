# PRD: Audit Dashboard — Review, Versioning, and AI-Assisted QC

## Introduction

The Audit Dashboard is the primary workspace where auditors and reviewers open a building's audit, inspect line-by-line fixture data (LXL), cross-reference photos and floorplan pins, version their changes, and run AI-assisted quality-checks before exporting. This PRD captures the 11 feature gaps identified after the Phase-1 restyle, derived from the wireframes in `html_app` and the brand mockups. The existing `ProjectDetailPage`, `ChatPanel`, and audit version models are the foundation; this PRD extends them into a single dashboard experience.

Reference wireframes: "Audit Webpage Without Data Review Activated" and "Audit Dashboard with Data Review" (provided by user, 2026-05-30).

## Goals

- Make a single page the only place auditors need to view, edit, version, and review an audit.
- Surface high-level audit metadata (client, building, sqft, utility, EM, counts) without scrolling.
- Let reviewers move between audit versions and diff them.
- Couple the LXL table, floorplan pins, and photo thumbnails so selecting one updates the other two.
- Auto-version any LXL edit (timestamped, named, non-destructive).
- Provide an AI Data Review panel (Standard QC, Historical Model, Claude chat) that highlights rows in real time and exports a review report.

## User Stories

### US-101: Open Audit picker
**Description:** As an auditor, I want to import an in-field audit into a project so it becomes a working `AuditVersion` on the dashboard.

**Acceptance Criteria:**
- [ ] "Open Audits" button on dashboard opens a panel listing audits not yet imported.
- [ ] Each entry shows Client, Building, SQFT, Auditor, Audit Date.
- [ ] Selecting an entry creates a new `AuditVersion` (v1.0) on the target building.
- [ ] Empty state when no pending audits.
- [ ] Backend endpoint `GET /pending-audits/` and `POST /pending-audits/:id/import/`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-102: Audit metadata strip
**Description:** As a reviewer, I want client, building, sqft, utility, EM, code-req, dates, and component counts shown above the LXL table so I have context at a glance.

**Acceptance Criteria:**
- [ ] Metadata strip renders Client, Building, SQFT, Utility, EM, Code Req, Start Date, End Date, Days On Site, Fixtures count, Switches count, Controls count.
- [ ] Pulls from `AuditVersion` + related Building/Project fields; counts computed from rows.
- [ ] Mobile: collapses to two-column grid; desktop: single row of cards.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-103: Version chip selector
**Description:** As a reviewer, I want chips per audit version (V1.0, V2.0, …) so I can switch between snapshots.

**Acceptance Criteria:**
- [ ] Horizontal chip list shows every `AuditVersion` for the building, with version number + "Reviewed M.D.YY" timestamp.
- [ ] Active chip styled distinctly; click loads that version's data into the dashboard.
- [ ] Keyboard: left/right arrows move between adjacent versions.
- [ ] URL reflects selected version: `/audit-versions/:versionId`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-104: Version diff view
**Description:** As a reviewer, I want to compare two versions side-by-side so I can see what changed between snapshots.

**Acceptance Criteria:**
- [ ] "Diff" button on a version chip opens a two-pane view: previous vs current.
- [ ] Modified rows highlighted yellow; added rows green; removed rows struck-through red.
- [ ] Backend endpoint `GET /audit-versions/:id/diff/?against=:otherId` returns row-level diff.
- [ ] Exit returns to single-version view.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-105: Save current state as new version
**Description:** As an auditor, I want to manually snapshot the current dashboard state as a named version so I can mark milestones.

**Acceptance Criteria:**
- [ ] "Save Current State" button opens prompt for label (default: timestamp).
- [ ] Creates new `AuditVersion` with incremented `version_number`, copies all rows + edits.
- [ ] New version becomes active immediately; chip list updates.
- [ ] Backend endpoint `POST /audit-versions/:id/snapshot/` w/ `{ label }`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-106: LXL editable table
**Description:** As an auditor, I want to click any cell in the LXL table and edit it inline so I can correct field data.

**Acceptance Criteria:**
- [ ] All LXL columns (Facility, Floor, Room Name, Pin, Base Hrs, Height, Room Info, Int/Ctrl, Fixture ID, Mount, Qty) editable inline.
- [ ] Switch/Controls sub-rows render italic + faded per wireframe.
- [ ] Enter commits, Esc cancels, Tab moves to next cell.
- [ ] Each commit triggers auto-version (see US-107).
- [ ] Validation: numeric fields reject non-numeric; required fields flagged.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-107: Auto-version on LXL edit
**Description:** As a reviewer, I want every edit to fork a new version so history is preserved automatically.

**Acceptance Criteria:**
- [ ] On commit of an LXL edit, backend creates new `AuditVersion` with timestamped label (`Auto-save 5/30/26 14:32`).
- [ ] Batches edits made within 30s into single version to avoid version-spam.
- [ ] Version chip list refreshes after batch closes.
- [ ] User can rename auto-versions inline from chip.
- [ ] Backend endpoint `PATCH /audit-versions/:id/rows/:rowId/` returns new version id.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-108: Floorplan image + pin overlay
**Description:** As a reviewer, I want a floorplan image with clickable pins for each room so I can navigate spatially.

**Acceptance Criteria:**
- [ ] Building model accepts a floorplan image upload (PNG/JPG) per floor.
- [ ] Pins (x,y coords on image) render as overlay; each pin tied to a room/row.
- [ ] Click pin selects matching LXL row(s) (scroll + highlight).
- [ ] Pan/zoom on floorplan image (mouse wheel + drag).
- [ ] Pin coords editable in admin or via drag in an explicit "edit pins" mode.
- [ ] Backend endpoints: `POST /buildings/:id/floorplans/`, `GET /audit-versions/:id/pins/`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-109: LXL ↔ Map ↔ Photos sync
**Description:** As a reviewer, I want selecting an LXL row to move the map to its pin and load its photos, and vice-versa.

**Acceptance Criteria:**
- [ ] Click an LXL row → floorplan pans/zooms to that pin and highlights it.
- [ ] Click a pin → LXL scrolls to and highlights the corresponding row.
- [ ] Photo panel updates to show Fixture/Switch/Controls thumbnails for the selected row.
- [ ] Selection state shared via single store (Zustand or React context).
- [ ] No-pin rows still update photos when row selected.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-110: Photo panel (Fixture / Switch / Controls)
**Description:** As a reviewer, I want labeled photo thumbnails for the selected row so I can verify what was captured.

**Acceptance Criteria:**
- [ ] Three-up thumbnail grid: Fixture, Switch, Controls.
- [ ] Click thumbnail opens lightbox with full-res image + EXIF.
- [ ] Empty slot shows dashed placeholder w/ "no photo" label.
- [ ] Photos pulled from existing audit photo store via row id.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-111: Data Review Mode toggle
**Description:** As a reviewer, I want an "Enter Data Review Mode" button that reveals the AI review panel on the right.

**Acceptance Criteria:**
- [ ] Button toggles between "Enter Data Review Mode" and "Exit Data Review Mode".
- [ ] When entered, right panel slides in (≥384px wide) containing Data Review Methods + Reporting Area + Export.
- [ ] LXL table reflows to remaining width.
- [ ] State persists in URL search param (`?review=1`).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-112: Standard Quality Check method
**Description:** As a reviewer, I want a one-click rule-based QC pass that flags common data issues without needing AI.

**Acceptance Criteria:**
- [ ] "Standard Quality Check" button in Data Review Methods.
- [ ] Runs deterministic rules: missing pin, missing height, missing fixture ID, qty=0 w/ fixture, alphanumeric room names, classrooms > 15 fixtures, exterior fixtures missing photocell.
- [ ] Returns list of flagged rows w/ severity (red/yellow) and reason.
- [ ] Backend endpoint `POST /audit-versions/:id/standard-qc/`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-113: Historical Model method
**Description:** As a reviewer, I want to compare the current audit against a historical model so anomalies surface.

**Acceptance Criteria:**
- [ ] "Select Historical Model" opens dropdown of prior `AuditVersion`s (same client or same building).
- [ ] On select, compares fixture mix, qty per room type, mount distribution.
- [ ] Returns flagged rows where current deviates from historical norms (configurable threshold).
- [ ] Backend endpoint `POST /audit-versions/:id/historical-compare/` w/ `{ baseline_version_id }`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-114: Claude chat review with predefined prompts
**Description:** As a reviewer, I want a Claude-powered chat in the review panel with predefined prompts for common audit-review tasks.

**Acceptance Criteria:**
- [ ] Reuses existing `ChatPanel` and `audit-review/:versionId/` WebSocket.
- [ ] Predefined prompts include: "Look for crawl-space qty", "Check alphanumeric rooms", "Highlight auditorium for fast lookup", "Classrooms > 15 fixtures", "Exterior fixtures without integral photocell", "Switch plate toggle-count check".
- [ ] Predefined prompts seeded via Django data migration.
- [ ] Assistant response can contain `<flag row="123" severity="red">reason</flag>` tags parsed into the Reporting Area (see US-115).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-115: Reporting Area with row jump + auto-highlight
**Description:** As a reviewer, I want a real-time bullet list of all flagged rows that I can click to jump to the row in the LXL.

**Acceptance Criteria:**
- [ ] Reporting Area below Data Review Methods.
- [ ] Aggregates flags from Standard QC + Historical + Claude chat into single deduplicated list.
- [ ] Each entry shows: row identifier, severity dot (red/yellow), reason.
- [ ] Clicking entry scrolls LXL to row + selects it (also updates map + photos via US-109).
- [ ] LXL rows auto-highlighted by severity (red bg for red flags, yellow for yellow).
- [ ] "Clear flags" button resets review session.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-116: Export Review Data
**Description:** As a reviewer, I want to export the current review session (flags + decisions) as a file for handoff.

**Acceptance Criteria:**
- [ ] "Export Review Data" button at bottom of review panel.
- [ ] Exports CSV (rows + flag reasons + severity + reviewer notes) and JSON (full structured payload).
- [ ] Filename: `{building}-{version}-review-{YYYYMMDD}.csv`.
- [ ] Backend endpoint `GET /audit-versions/:id/review-export/?format=csv|json`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

## Functional Requirements

- FR-1: Add `PendingAudit` model (or reuse existing import staging) with `GET /pending-audits/` and `POST /pending-audits/:id/import/`.
- FR-2: Extend `AuditVersion` w/ `parent_version_id` to support diffs and `auto_saved` boolean.
- FR-3: Add `AuditRow` model (or extend existing) covering Facility, Floor, Room Name, Pin (FK to FloorplanPin), Base Hrs, Height, Room Info, Int/Ctrl type, Fixture ID, Mount, Qty.
- FR-4: Add `Floorplan` (image per floor) and `FloorplanPin` (x, y, room_id) models w/ upload + serve endpoints.
- FR-5: Add `ReviewFlag` model: `{ version_id, row_id, severity, reason, source: 'standard'|'historical'|'claude', created }`.
- FR-6: WebSocket `audit-review/:versionId/` extended to emit `flag` events parsed from Claude responses.
- FR-7: Frontend uses shared selection store (current row, current pin) updated bidirectionally.
- FR-8: Auto-version debounces row edits over 30s window into a single new `AuditVersion`.
- FR-9: Version chip list polls/invalidates on every mutation so chips stay current.
- FR-10: Standard QC and Historical Compare run server-side; results merged into Reporting Area client-side.

## Non-Goals

- No mobile/PWA support for the dashboard — auditors keep using `html_app` PWA in the field.
- No editing of pin x/y coords via drag in this PRD (admin-only for now; mark as Open Question).
- No collaborative real-time editing (single-user-at-a-time per version).
- No AI auto-fix of flagged rows — only flagging.
- No new auth/permission model — reuse existing project membership.
- No CAD/IFC import — floorplans are flat image uploads only.

## Design Considerations

- Use existing brand tokens from [index.css](frontend/src/index.css): `--brand-paper`, `--brand-ink`, `--brand-ember`, `--brand-teal`, `--brand-rule`, `det-card`, `det-chip`, `det-btn`.
- Version chips reuse `det-chip` styling; active chip uses ink fill (see ProjectsList filter pill pattern).
- Reporting Area styled as a "punch list" — monospace row ids, ember/teal severity dots, paper background.
- Floorplan pin overlay uses `position: absolute` on top of `<img>`; pin = circle w/ row index in burnt orange.
- Photo panel grid reuses three-up layout shown in wireframe; lightbox can reuse existing `PanoramaViewer` if applicable, otherwise simple modal.
- Data Review panel: right slide-in @ 24rem min width, paper-soft bg, divided into three blocks (Methods, Reporting, Export).
- LXL table: keep TanStack Table; sub-rows for Switch/Controls rendered w/ `text-(--brand-ink-soft) italic`.

## Technical Considerations

- Build on existing `AuditVersion` model + `audit-review/:versionId/` WebSocket; do not introduce a new chat infra.
- Selection store: a single Zustand store (or React context) keyed by `(versionId, rowId, pinId)`. Keep ProjectChatPanel separate.
- Auto-versioning: implement debounce on the backend via a "pending edits" buffer per version, or simpler — frontend buffers edits and sends a single PATCH-bundle every 30s while editing.
- Diff: server-side row-level diff keeps client thin; consider `json_diff` or compute against `parent_version_id`.
- Floorplan images stored in Django media or S3; serve via existing media settings (no new storage backend).
- Standard QC rules live in `audit/quality_checks.py` for testability; one function per rule, composed into a runner.
- Flag tag parsing for Claude responses: server-side regex strips `<flag …>` tags before token-streaming the visible text, and emits separate `flag` WebSocket events.
- Render compiler warning on `useReactTable` is pre-existing — not a blocker for new stories.

## Success Metrics

- Time from opening an audit to first flagged row < 10s (Standard QC runs in < 3s on a 1k-row audit).
- Reviewer can move between three adjacent versions and run QC on each in < 30s total.
- All 11 wireframe features visible/usable from a single page without modals (except lightbox + diff).
- Zero regression in existing audit-version + chat tests (currently 162 passing).

## Open Questions

- Should auto-versioning be opt-in per-user, or always on?
- Pin placement: admin-only vs in-dashboard edit mode — when do we promote?
- Floorplan per-floor or per-building? Wireframe shows one map; in real engagements multi-floor buildings will need per-floor scoping.
- Historical Model: scope baselines to same client only, same building only, or any prior version?
- Reviewer notes per flag — in this PRD or follow-up?
- Lightbox: build new or reuse panorama viewer (different use case — flat photos, not 360°)?
- Export Review Data: CSV + JSON sufficient, or do we need PDF for client handoff?
