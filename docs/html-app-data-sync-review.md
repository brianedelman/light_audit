# html_app Data-Sync Alignment Review

**Date:** 2026-05-26
**Story:** US-055
**Purpose:** Map every field emitted by `html_app/app.js` against the Django backend models, identify gaps in the sync pipeline, and recommend minimal changes for Phase 1 end-to-end sync.

---

## 1. Sync Architecture Overview

The PWA (`html_app/app.js`) stores audit data locally (IndexedDB via storage shim) and syncs to the backend via two paths:

- **Audit data:** `POST /api/audits/sync` — pushes structured JSON (`SyncRequest` schema in `audit/api/sync.py`)
- **Media:** `POST /api/media/multipart/*` — separate R2 multipart upload flow

The sync drain (`html_app/sync-drain.js`) polls and sends queued items when online.

**Current sync payload schema** (`SyncRequest`):
```
{
  building_uuid: UUID,
  client_uuid: UUID | null,     // idempotency key
  base_version_uuid: UUID | null,
  payload: {
    floors: [{ name, level, sort_order, rooms: [{ name, room_type, zone_label, notes,
      log_entries: [{ fixture_id, description, qty, wattage, location, switch_type,
                      controls, mount_type, notes }]
    }]}]
  }
}
```

The endpoint creates `AuditVersion` + child `Floor`/`Room`/`LogEntry` records and stores the raw payload in `AuditVersion.source_payload`.

**Core finding:** The PWA captures ~50 fields per entry; the sync payload passes only 9 log-entry fields and 4 room fields. The Django models already have columns for most of the missing data — the gap is in the sync schema, not the data model.

---

## 2. PWA → Backend Field Mapping

### 2.1 Building Data (`bldgData`)

Building data is stored in `localStorage` key `auditTool_building_v1`. The sync endpoint looks up an existing `Building` by `client_uuid` — building-level fields are **not included in the sync payload** and must be pre-provisioned.

| PWA Field | Django Field | Sync Status | Notes |
|---|---|---|---|
| `name` | `Building.name` | Pre-provisioned | Not in sync payload |
| `address` | `Building.address` | Pre-provisioned | |
| `client` | `Project.client` | Pre-provisioned | On Project model (after US-009) |
| `auditor` | `Building.auditor` | Pre-provisioned | |
| `type` | `Building.building_type` | Pre-provisioned | String→choices mapping needed |
| `sqft` | `Building.square_feet` | Pre-provisioned | String→int cast needed |
| `year` | `Building.year_built` | Pre-provisioned | String→int cast needed |
| `utility` | `Building.utility` | Pre-provisioned | Model field exists |
| `utilityName` | — | **Unmapped** | No dedicated field; could merge into `utility` |
| `notes` | — | **Unmapped** | No notes field on Building model |
| `hours` | `Building.baseline_hours` | Pre-provisioned | Model field exists (DecimalField) |
| `projectType` | `Project.project_type` | Pre-provisioned | On Project model |
| `climateZone` | `Building.climate_zone` | Pre-provisioned | Model field exists |
| `roomTypeHours` | `Building.room_type_hours_overrides` | Pre-provisioned | JSONField exists |

**Gaps:** `utilityName` (no field) and `notes` (no field on Building). Low priority.

---

### 2.2 Floor Data

PWA stores floors in `localStorage` key `auditTool_floors_v1`. Each floor: `{ id, name, type, createdAt }`.

| PWA Field | Sync Payload | Django Field | Status |
|---|---|---|---|
| `name` | `FloorPayload.name` | `Floor.name` | **Synced** |
| `type` | — | — | **Not synced, unmapped** | PWA has type strings ("Basement", "Roof"); no model field |
| `id` | — | `Floor.pk` (auto) | Client-side ID not synced; server auto-assigns PK |
| `createdAt` | — | `Floor.created` (auto) | Server sets own timestamp |
| — | `FloorPayload.level` | `Floor.level` | **Backend-only** | Exists in schema but PWA doesn't emit |
| — | `FloorPayload.sort_order` | `Floor.sort_order` | **Backend-only** | Exists in schema but PWA doesn't emit |

**Gap:** PWA `type` field lost on sync. Low priority — could add `Floor.floor_type` CharField.

---

### 2.3 Room Data

Room metadata in the PWA is embedded in log entries — the first entry per room carries `roomType`, `height`, `dimensions`, `ceilingType`. The sync schema currently accepts only 4 room fields.

| PWA Field (from entry) | Sync Payload | Django Field | Status |
|---|---|---|---|
| Room name (from `space`) | `RoomPayload.name` | `Room.name` | **Synced** |
| `roomType` | `RoomPayload.room_type` | `Room.room_type` | **Synced** |
| Zone (from `space` suffix after " · ") | `RoomPayload.zone_label` | `Room.zone_label` | **Synced** |
| `notes` (first entry) | `RoomPayload.notes` | `Room.notes` | **Synced** |
| `height` (ceiling height) | — | `Room.mount_height` | **Not synced** | Semantic mismatch: PWA=ceiling height, model=mount height |
| `dimensions` (`{len, wid}` or string) | — | `Room.dimensions` | **Not synced** | Field exists on model |
| `ceilingType` | — | `Room.ceiling_type` | **Not synced** | Field exists on model |
| Derived from `dimensions` | — | `Room.square_feet` | **Not synced** | Could compute from len×wid |
| — | — | `Room.pin_code` | **Not synced** | Floor plan pin reference |
| `baselineHours` (room-type override) | — | `Room.hours_override` | **Not synced** | Field exists on model |
| `switchNotes` contains "3-Way" | — | `Room.wiring_three_way` | **Not synced** | PWA stores as string in array |
| `switchNotes` contains "A/B Switching" | — | `Room.wiring_ab_switching` | **Not synced** | PWA stores as string in array |
| `switchNotes` contains "No Neutral" | — | `Room.wiring_no_neutral` | **Not synced** | PWA stores as string in array |

**Critical gaps:**
1. **`height`/ceiling height** — PWA captures on every room; model has `mount_height` (semantically different). Recommend adding `ceiling_height` field or repurposing `mount_height`.
2. **`dimensions` + `ceilingType`** — Fields exist on model but not in sync payload. Easy fix.
3. **Wiring flags** — PWA stores wiring info as strings in `switchNotes[]`; backend has dedicated booleans. Sync should parse these.

---

### 2.4 Log Entry Data

This is the largest gap. The PWA captures ~30 fields per entry; the sync schema passes only 9.

| PWA Field | Sync Payload | Django Field | Status |
|---|---|---|---|
| `fixtureId` | `fixture_id` | `LogEntry.fixture_id` | **Synced** |
| `desc` | `description` | `LogEntry.description` | **Synced** |
| `qty` | `qty` | `LogEntry.qty` | **Synced** |
| `watts` | `wattage` | `LogEntry.wattage` | **Synced** |
| `fixtureType` ("Interior"/"Exterior") | `location` | `LogEntry.location` | **Synced** | Needs lowercase transform |
| `numSwitches` (formatted string) | `switch_type` | `LogEntry.switch_type` | **Synced** | Lossy: structured `switchType[]` flattened to string |
| `existingCtrls` (formatted string) | `controls` | `LogEntry.controls` | **Synced** | Lossy: structured data flattened to string |
| `mountType` | `mount_type` | `LogEntry.mount_type` | **Synced** |
| `notes` | `notes` | `LogEntry.notes` | **Synced** |
| `intSensor` | — | `LogEntry.flag_integral_sensor` | **Not synced** | Bool flag, field exists |
| `embb` | — | `LogEntry.flag_embb` | **Not synced** | Bool flag, field exists |
| `airReturn` | — | `LogEntry.flag_air_return` | **Not synced** | Bool flag, field exists |
| `wireGuard` | — | `LogEntry.flag_wire_guard` | **Not synced** | Bool flag, field exists |
| `volt480` | — | `LogEntry.flag_volt_480` | **Not synced** | Bool flag, field exists |
| `emGen` | — | `LogEntry.flag_em_gen` | **Not synced** | Bool flag, field exists |
| `photocell` | — | `LogEntry.flag_photocell` | **Not synced** | Bool flag, field exists |
| `twistlockPC` | — | `LogEntry.flag_twistlock_pc` | **Not synced** | Bool flag, field exists |
| `wetLocation` | — | `LogEntry.flag_wet_location` | **Not synced** | Bool flag, field exists |
| `darkSky` | — | `LogEntry.flag_dark_sky` | **Not synced** | Bool flag, field exists |
| `optic` | — | `LogEntry.optic` | **Not synced** | "Type II/III/IV/V", field exists |
| `height` (per-entry) | — | `LogEntry.mount_height` | **Not synced** | CharField, field exists |
| `baselineHours` | — | `LogEntry.ctrl_hours` | **Not synced** | DecimalField, field exists |
| `facility` | — | `LogEntry.facility` | **Not synced** | Redundant with Building FK |
| `floor` | — | `LogEntry.floor` (CharField) | **Not synced** | Redundant with Room→Floor FK |
| `space` | — | `LogEntry.space_zone` | **Not synced** | Redundant with Room FK |
| `isNewAddition` | — | — | **Unmapped** | No model field |
| `line` | — | — | **Unmapped** | Sequential number; no model field |
| `switchType[]` (array of `{name, qty}`) | — | — | **Lossy** | Pre-formatted into `switch_type` string |
| `switchQty` | — | — | **Lossy** | Rolled into formatted string |
| `ctrls[]` (recommendations) | — | — | **Not synced** | Maps to SpecItem (Phase 2) |
| `swRec[]` (recommendations) | — | — | **Not synced** | Maps to SpecItem (Phase 2) |
| `fixRec[]` (recommendations) | — | — | **Not synced** | Maps to SpecItem (Phase 2) |
| `ctrlRecs[]` (recommendations) | — | — | **Not synced** | Maps to SpecItem (Phase 2) |
| `hasCustomSwitch/Existing/Ctrl` | — | — | **Not needed** | UI state flags |

**Critical gaps:**
1. **All 10 fixture flag fields** — Essential for audit review agent. Without them, Claude can't flag 480V fixtures, sensor conflicts, EMBB requirements, etc.
2. **`optic`** — Required for exterior fixture specifications.
3. **`ctrl_hours`/`baselineHours`** — Needed for energy savings calculations.

---

### 2.5 Photo/Media Data

Photos use separate R2 multipart upload flow, not the audit sync payload.

| PWA Data | Django Field | Status |
|---|---|---|
| Photo blob (IndexedDB) | R2 storage via multipart upload | **Separate flow** |
| `photoType` ("room"/"fixture"/"switch"/"controls") | `Photo.photo_type` | **Mapped** |
| Room association (key: `photo_{room}_{type}`) | `Photo.room` FK | **Needs linking** | Keyed by room name; backend needs room PK |
| EXIF timestamp | `Photo.taken_at` | **Mapped** (via compress.js) |
| — | `Photo.log_entry` FK | **Not linked** | Photos not associated with specific entries during sync |

**Gap:** After sync creates Room records, media uploads need room PK mapping. Currently `Photo.room` and `Photo.log_entry` remain null.

---

### 2.6 Floor Plan Data

| PWA Data | Django Model | Status |
|---|---|---|
| Floor plan images/PDFs | `FloorPlan.pdf` / `.image` | **Not synced** |
| Pin positions (`{xPct, yPct}`) | `FloorPlanPin.x` / `.y` | **Not synced** |
| Pin→Room links | `FloorPlanPin.room` FK | **Not synced** |
| Room polygons | `FloorPlanPin.polygon` JSONField | **Not synced** |
| Light level readings | `LightLevelReading` | **Not synced** |

**Phase 2 scope.** Data structures exist on both sides but no sync path.

---

### 2.7 Spec/Recommendation Data

| PWA Data | Django Model | Status |
|---|---|---|
| `fixRec[]` (fixture recommendations) | `SpecItem` | **Not synced** |
| `swRec[]` (switch recommendations) | `SpecItem` | **Not synced** |
| `ctrls[]` (control recommendations) | `SpecItem` | **Not synced** |
| `customFixtures[]` | `CatalogProduct` (or custom) | **Not synced** |

**Phase 2 scope.**

---

## 3. Fields Backend Needs but PWA Does Not Emit

| Model.Field | Impact | Notes |
|---|---|---|
| `LogEntry.flag_*` (10 flags) | **HIGH** | Agent review blind to fixture attributes |
| `LogEntry.optic` | **HIGH** | Exterior spec engine needs this |
| `LogEntry.ctrl_hours` | **MEDIUM** | Energy calcs need operating hours |
| `LogEntry.mount_height` | **LOW** | Per-entry; also on Room |
| `Room.dimensions` | **MEDIUM** | Room metadata for review |
| `Room.ceiling_type` | **MEDIUM** | Room metadata for review |
| `Room.wiring_*` (3 booleans) | **MEDIUM** | Wiring conditions affect recommendations |
| `Room.hours_override` | **LOW** | Falls back to building default |

All these fields **exist on the Django models** and **are captured by the PWA** — they just aren't included in the `SyncRequest` schema.

---

## 4. Fields PWA Emits That Nothing Consumes

| PWA Field | Notes |
|---|---|
| `bldgData.utilityName` | Utility company name; no dedicated model field |
| `bldgData.notes` | Building-level notes; no model field |
| `floor.type` | Floor type string ("Basement"/"Roof"); no model field |
| `floor.createdAt` | Client timestamp; server uses own |
| `entry.isNewAddition` | Boolean for new fixtures; no model field |
| `entry.line` | Sequential line number; no model field |
| `entry.switchType[]` | Structured switch data; flattened to string |
| `entry.switchQty` | Switch quantity; lost in formatting |
| `entry.ctrls[]` / `swRec[]` / `fixRec[]` / `ctrlRecs[]` | Recommendation arrays (Phase 2 SpecItem scope) |
| `entry.hasCustomSwitch/Existing/Ctrl` | UI state flags; not needed in backend |
| `roomDrafts` | In-progress editing state; not for sync |
| `customFixtures[]` | User-created fixtures; no sync path |
| `catalogueItems[]` / `catalogueBuilding` | Fixture catalogue cache; no sync path |
| `roomTemplates[]` | Room templates; no sync path |

---

## 5. Phase 2 Spec-Engine Blockers

1. **Fixture flags not synced** — The 10 boolean flags (`intSensor`, `embb`, etc.) are required for automated spec matching. Without them, the engine can't determine constraints (e.g., "needs EMBB", "480V circuit").

2. **Optic type not synced** — Required for exterior fixture replacement matching (Type II/III/IV/V distribution).

3. **Operating hours not synced** — `baselineHours` / `ctrl_hours` needed for energy savings calculations.

4. **Recommendations not synced** — `fixRec`, `swRec`, `ctrls` arrays contain field auditor recommendations that should seed `SpecItem` records.

5. **Photo→LogEntry linking** — Photos need association with specific entries for the spec engine to reference fixture photos during matching.

6. **Floor plans not synced** — Floor plan data (images, pins, polygons, light levels) needed for layout-aware recommendations.

7. **Custom fixtures not synced** — Auditor-created fixtures need a sync path to `CatalogProduct` or a custom fixture table.

---

## 6. Recommendations for Minimal PWA Changes (Phase 1 End-to-End Sync)

### Priority 1: Expand sync payload schemas (backend only — no migration)

All target model fields already exist. Only the Ninja `Schema` classes and `_create_children()` need updating.

**`LogEntryPayload` additions:**
```python
class LogEntryPayload(Schema):
    # ... existing 9 fields ...
    optic: str = ""
    mount_height: str = ""
    ctrl_hours: float | None = None
    flag_integral_sensor: bool = False
    flag_embb: bool = False
    flag_air_return: bool = False
    flag_wire_guard: bool = False
    flag_volt_480: bool = False
    flag_em_gen: bool = False
    flag_photocell: bool = False
    flag_twistlock_pc: bool = False
    flag_wet_location: bool = False
    flag_dark_sky: bool = False
```

**`RoomPayload` additions:**
```python
class RoomPayload(Schema):
    # ... existing 4 fields ...
    ceiling_height: str = ""    # or use mount_height
    dimensions: str = ""
    ceiling_type: str = ""
    hours_override: float | None = None
    wiring_three_way: bool = False
    wiring_ab_switching: bool = False
    wiring_no_neutral: bool = False
```

### Priority 2: Update PWA payload construction

Modify `html_app/sync-drain.js` (or add payload builder in `app.js`) to include additional fields. The PWA already captures all this data — it just doesn't send it.

**Key PWA → sync field name mapping:**

| PWA Field | Sync Payload Field |
|---|---|
| `entry.intSensor` | `flag_integral_sensor` |
| `entry.embb` | `flag_embb` |
| `entry.airReturn` | `flag_air_return` |
| `entry.wireGuard` | `flag_wire_guard` |
| `entry.volt480` | `flag_volt_480` |
| `entry.emGen` | `flag_em_gen` |
| `entry.photocell` | `flag_photocell` |
| `entry.twistlockPC` | `flag_twistlock_pc` |
| `entry.wetLocation` | `flag_wet_location` |
| `entry.darkSky` | `flag_dark_sky` |
| `entry.optic` | `optic` |
| `entry.baselineHours` | `ctrl_hours` |
| `entry.height` (first per room) | Room `ceiling_height` |
| `entry.dimensions` (first per room) | Room `dimensions` |
| `entry.ceilingType` (first per room) | Room `ceiling_type` |
| `"3-Way" in switchNotes` | Room `wiring_three_way: true` |
| `"A/B Switching" in switchNotes` | Room `wiring_ab_switching: true` |
| `"No Neutral" in switchNotes` | Room `wiring_no_neutral: true` |

### Priority 3: Consider adding `ceiling_height` to Room model

`Room.mount_height` is semantically wrong for ceiling height. Options:
- **A)** Rename `mount_height` → `ceiling_height` (migration + rename everywhere)
- **B)** Add `ceiling_height` alongside `mount_height` (recommended for Phase 1)

### Priority 4: Return room name→PK mapping in sync response

After `POST /api/audits/sync` creates Room records, return a `room_name → room_id` map in `SyncResponse` so the PWA can associate queued photo uploads with correct Room PKs.

### Not needed for Phase 1

- Floor plan sync (Phase 2)
- Recommendation/SpecItem sync (Phase 2)
- Custom fixture sync (Phase 2)
- Building-level data in sync payload (pre-provisioned via admin)
- `utilityName`, `isNewAddition`, `line` fields (low value)

---

## 7. Summary

| Category | Synced | Not Synced (field exists) | Unmapped (no field) |
|---|---|---|---|
| Building fields (14) | 0 (pre-provisioned) | 12 | 2 |
| Floor fields (4) | 1 | 2 | 1 |
| Room fields (12) | 4 | 7 | 1 |
| LogEntry fields (24+) | 9 | 14 | 2 |
| Photo fields | Separate flow | 2 linking gaps | — |
| Floor plan fields | — | All (Phase 2) | — |
| Spec/Rec fields | — | All (Phase 2) | — |

**Bottom line:** The sync pipeline handles the structural hierarchy (floors → rooms → entries) correctly, but drops ~60% of per-entry data. The most impactful fix is adding the 10 fixture flag fields + optic + ctrl_hours to the `LogEntryPayload` schema — **no migration needed** since the Django model fields already exist. The gap is entirely in the sync schema definitions and the PWA payload construction.
