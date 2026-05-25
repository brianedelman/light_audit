/**
 * storage-shim.js — localStorage shim that proxies to IndexedDB via auditStorage.
 *
 * Installs window.__auditStorage with a synchronous getItem/setItem/removeItem
 * API backed by an in-memory cache that is hydrated from IndexedDB on boot.
 *
 * On first boot (detected by a sentinel key in IndexedDB), copies all existing
 * localStorage keys to IndexedDB then clears localStorage.
 *
 * Usage: load this script BEFORE app.js. Boot completes asynchronously; the
 * script sets window.__auditStorageReady (a Promise) so app.js can await it.
 *
 *   await window.__auditStorageReady;
 *   // now window.__auditStorage is safe to use
 *
 * Values are stored as raw strings (identical to the localStorage API contract).
 */

const MIGRATION_SENTINEL = '__auditShimMigrated';

const DB_NAME = 'auditDB';
const DB_VERSION = 1;
const JSON_STORE = 'json';

// ---------------------------------------------------------------------------
// Minimal IndexedDB helpers (self-contained; no dependency on storage.js)
// ---------------------------------------------------------------------------

function _open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(JSON_STORE)) {
        db.createObjectStore(JSON_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
    };
    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = () => reject(req.error);
  });
}

function _idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(JSON_STORE, 'readonly').objectStore(JSON_STORE).get(key);
    req.onsuccess = (ev) => resolve(ev.target.result ? ev.target.result.value : undefined);
    req.onerror = () => reject(req.error);
  });
}

function _idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(JSON_STORE, 'readwrite').objectStore(JSON_STORE).put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function _idbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(JSON_STORE, 'readwrite').objectStore(JSON_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function _idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(JSON_STORE, 'readonly').objectStore(JSON_STORE).getAll();
    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// In-memory cache — stores raw strings (identical to localStorage contract)
// ---------------------------------------------------------------------------

const _cache = new Map();

// ---------------------------------------------------------------------------
// Boot: hydrate cache from IndexedDB, migrate localStorage on first run
// ---------------------------------------------------------------------------

async function _boot() {
  const db = await _open();

  // Check if migration has already happened
  const migrated = await _idbGet(db, MIGRATION_SENTINEL);

  if (!migrated) {
    // First boot: copy all localStorage keys to IndexedDB as raw strings
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          await _idbPut(db, key, raw);
        }
      }
      // Clear localStorage after migration
      localStorage.clear();
    }
    // Mark migration done
    await _idbPut(db, MIGRATION_SENTINEL, '__done__');
  }

  // Hydrate in-memory cache from IndexedDB (skip sentinel)
  const rows = await _idbGetAll(db);
  for (const row of rows) {
    if (row.key !== MIGRATION_SENTINEL) {
      _cache.set(row.key, row.value);
    }
  }

  db.close();
}

// ---------------------------------------------------------------------------
// Async flush helpers (fire-and-forget from sync API)
// ---------------------------------------------------------------------------

async function _flushSet(key, rawValue) {
  const db = await _open();
  await _idbPut(db, key, rawValue);
  db.close();
}

async function _flushRemove(key) {
  const db = await _open();
  await _idbDelete(db, key);
  db.close();
}

// ---------------------------------------------------------------------------
// Sync API — mirrors localStorage contract (raw strings in/out)
// ---------------------------------------------------------------------------

const __auditStorage = {
  /** Returns the stored raw string, or null if not found. */
  getItem(key) {
    const val = _cache.get(key);
    return val !== undefined ? val : null;
  },

  /** Stores the raw string value synchronously (flushes to IndexedDB async). */
  setItem(key, rawValue) {
    _cache.set(key, rawValue);
    _flushSet(key, rawValue).catch(() => {});
  },

  /** Removes the key synchronously (flushes to IndexedDB async). */
  removeItem(key) {
    _cache.delete(key);
    _flushRemove(key).catch(() => {});
  },
};

// ---------------------------------------------------------------------------
// Install on window
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.__auditStorage = __auditStorage;
  // Expose the ready promise so app.js can await hydration
  window.__auditStorageReady = _boot();
}

// ESM exports for testing
export { __auditStorage, _boot, _cache };
export const SENTINEL = MIGRATION_SENTINEL;
