/**
 * sync-queue.js — Offline sync queue for the Audit PWA.
 *
 * Persists pending sync items in IndexedDB ('sync_queue' store inside 'auditDB').
 * Items survive page reloads and are drained when connectivity is restored.
 *
 * Item shape:
 *   { id (auto), type: 'audit'|'media', payload?, blob_id?, meta?, retry_count, last_error }
 *
 * Public API:
 *   enqueueAudit(payload)         — queue an audit JSON payload
 *   enqueueMedia(blob_id, meta)   — queue a media upload
 *   peek()                        — return all pending items (oldest first)
 *   markDone(id)                  — remove a successfully synced item
 *   markFailed(id, err)           — increment retry_count + record error
 */

const DB_NAME = 'auditDB';
// Must be higher than the version used by storage.js (v1).
const DB_VERSION = 2;
const STORE = 'sync_queue';

/** Open the database, ensuring the sync_queue store exists. */
function _open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      // Re-create pre-existing stores only if they don't exist yet.
      if (!db.objectStoreNames.contains('json')) {
        db.createObjectStore('json', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = () => reject(req.error);
  });
}

function _req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = (ev) => resolve(ev.target.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add an item to the sync queue.
 * @param {object} item  — must include at least { type }
 * @returns {Promise<number>} the auto-assigned id
 */
async function _enqueue(item) {
  const db = await _open();
  const tx = db.transaction(STORE, 'readwrite');
  const id = await _req(tx.objectStore(STORE).add({ retry_count: 0, last_error: null, ...item }));
  db.close();
  return id;
}

/**
 * Queue an audit JSON payload for syncing.
 * @param {object} payload
 * @returns {Promise<number>} queue item id
 */
export function enqueueAudit(payload) {
  return _enqueue({ type: 'audit', payload });
}

/**
 * Queue a media blob for uploading.
 * @param {string} blob_id
 * @param {object} [meta]
 * @returns {Promise<number>} queue item id
 */
export function enqueueMedia(blob_id, meta = {}) {
  return _enqueue({ type: 'media', blob_id, meta });
}

/**
 * Return all pending queue items, oldest first.
 * @returns {Promise<Array<object>>}
 */
export async function peek() {
  const db = await _open();
  const tx = db.transaction(STORE, 'readonly');
  const items = await _req(tx.objectStore(STORE).getAll());
  db.close();
  // IDB autoincrement keys are sequential, so getAll() is already ordered oldest-first.
  return items;
}

/**
 * Remove a successfully synced item from the queue.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function markDone(id) {
  const db = await _open();
  const tx = db.transaction(STORE, 'readwrite');
  await _req(tx.objectStore(STORE).delete(id));
  db.close();
}

/**
 * Record a failed sync attempt: increments retry_count and saves the error message.
 * @param {number} id
 * @param {string} err  — error description
 * @returns {Promise<void>}
 */
export async function markFailed(id, err) {
  const db = await _open();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const item = await _req(store.get(id));
  if (!item) {
    db.close();
    return;
  }
  item.retry_count = (item.retry_count || 0) + 1;
  item.last_error = String(err);
  await _req(store.put(item));
  db.close();
}

// Expose on window for non-module scripts.
if (typeof window !== 'undefined') {
  window.syncQueue = { enqueueAudit, enqueueMedia, peek, markDone, markFailed };
}
