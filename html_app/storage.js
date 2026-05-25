/**
 * auditStorage — IndexedDB module for the Audit PWA.
 *
 * Two object stores:
 *   'json'  — key-value pairs for audit JSON data
 *   'blobs' — binary blobs with metadata
 *
 * All functions are async. Available as ES module exports and on
 * window.auditStorage for non-module scripts.
 */

const DB_NAME = 'auditDB';
const DB_VERSION = 1;

/** Open (or create) the database, resolving to an IDBDatabase. */
function _open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains('json')) {
        db.createObjectStore('json', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
    };
    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = () => reject(req.error);
  });
}

/** Wrap an IDB request in a Promise. */
function _req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = (ev) => resolve(ev.target.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve a JSON value by key.
 * @param {string} key
 * @returns {Promise<unknown|undefined>}
 */
export async function getJSON(key) {
  const db = await _open();
  const tx = db.transaction('json', 'readonly');
  const row = await _req(tx.objectStore('json').get(key));
  db.close();
  return row ? row.value : undefined;
}

/**
 * Store a JSON value by key (upsert).
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<void>}
 */
export async function setJSON(key, value) {
  const db = await _open();
  const tx = db.transaction('json', 'readwrite');
  await _req(tx.objectStore('json').put({ key, value }));
  db.close();
}

/**
 * Store a Blob with optional metadata.
 * @param {string} id
 * @param {Blob} blob
 * @param {Record<string, unknown>} [meta]
 * @returns {Promise<void>}
 */
export async function putBlob(id, blob, meta = {}) {
  const db = await _open();
  const tx = db.transaction('blobs', 'readwrite');
  await _req(tx.objectStore('blobs').put({ id, blob, meta }));
  db.close();
}

/**
 * Retrieve a stored blob record.
 * @param {string} id
 * @returns {Promise<{id: string, blob: Blob, meta: object}|undefined>}
 */
export async function getBlob(id) {
  const db = await _open();
  const tx = db.transaction('blobs', 'readonly');
  const row = await _req(tx.objectStore('blobs').get(id));
  db.close();
  return row;
}

/**
 * List all blob records, optionally filtered by a predicate on meta.
 * @param {(meta: object) => boolean} [filter]
 * @returns {Promise<Array<{id: string, blob: Blob, meta: object}>>}
 */
export async function listBlobs(filter) {
  const db = await _open();
  const tx = db.transaction('blobs', 'readonly');
  const all = await _req(tx.objectStore('blobs').getAll());
  db.close();
  if (!filter) return all;
  return all.filter((row) => filter(row.meta));
}

/**
 * Delete a blob by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteBlob(id) {
  const db = await _open();
  const tx = db.transaction('blobs', 'readwrite');
  await _req(tx.objectStore('blobs').delete(id));
  db.close();
}

// Expose on window for non-module scripts
if (typeof window !== 'undefined') {
  window.auditStorage = { getJSON, setJSON, putBlob, getBlob, listBlobs, deleteBlob };
}
