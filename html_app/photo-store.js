/**
 * photo-store.js — Blob-based photo storage helpers for the Audit PWA.
 *
 * Provides:
 *   resolvePhotoSrc(val, storage) — resolves a photo value (blob ID or data URL)
 *     to a displayable src string.
 *   migratePhotosToBlobs(roomPhotos, storage) — converts base64 data URLs in the
 *     roomPhotos map to IndexedDB blobs and replaces them with blob IDs.
 *   capturePhotoBlob(file, key, meta, storage, compressToBlob) — stores a file
 *     as a compressed blob in IndexedDB and returns the blob ID string.
 *
 * All functions accept an explicit `storage` argument (window.auditStorage) so
 * they can be tested without browser globals.
 */

export const BLOB_PREFIX = 'audit-blob-';

/** Returns the full blob-id string for a raw UUID. */
export function blobId(uuid) {
  return BLOB_PREFIX + uuid;
}

/** Returns true if val is a blob-id managed by this module. */
export function isBlobId(val) {
  return typeof val === 'string' && val.startsWith(BLOB_PREFIX);
}

/**
 * Resolve a photo value to a displayable src string.
 *
 * - Data URLs (data:...) pass through unchanged.
 * - Blob IDs (audit-blob-...) are fetched from IndexedDB and converted to
 *   object URLs via URL.createObjectURL().
 * - Unknown values pass through unchanged.
 *
 * @param {string} val
 * @param {object} storage — window.auditStorage (putBlob/getBlob API)
 * @returns {Promise<string>}
 */
export async function resolvePhotoSrc(val, storage) {
  if (!val) return val;
  if (!isBlobId(val)) return val; // data: URLs and unknowns pass through
  if (!storage) return val;
  const id = val.slice(BLOB_PREFIX.length);
  const row = await storage.getBlob(id);
  if (!row || !row.blob) return val;
  if (typeof URL !== 'undefined' && URL.createObjectURL) {
    try {
      return URL.createObjectURL(row.blob);
    } catch {
      // Blob may not be a native Blob instance (e.g. in test environments)
      return val;
    }
  }
  return val;
}

/**
 * Migrate existing base64 data-URL entries in roomPhotos to IndexedDB blobs.
 *
 * For each entry that is a data: URL, fetches it as a Blob, stores it via
 * storage.putBlob(), and replaces the entry with a blob ID.
 *
 * @param {Record<string, string[]>} roomPhotos — the in-memory photo map (mutated in place)
 * @param {object} storage — window.auditStorage
 * @returns {Promise<{changed: boolean}>}
 */
export async function migratePhotosToBlobs(roomPhotos, storage) {
  if (!storage) return { changed: false };
  let changed = false;
  for (const [key, vals] of Object.entries(roomPhotos)) {
    if (!Array.isArray(vals)) continue;
    const newVals = await Promise.all(
      vals.map(async (val) => {
        if (typeof val !== 'string' || !val.startsWith('data:')) return val;
        try {
          // Convert data URL to Blob via fetch
          const res = await fetch(val);
          const blob = await res.blob();
          const id =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2);
          await storage.putBlob(id, blob, { migratedFrom: key });
          changed = true;
          return blobId(id);
        } catch {
          return val; // keep as data URL on error
        }
      }),
    );
    roomPhotos[key] = newVals;
  }
  return { changed };
}

/**
 * Capture a photo file as a compressed blob in IndexedDB.
 *
 * Calls the provided compressToBlob function, stores the result, and returns
 * the blob ID string. Falls back to returning null if storage is unavailable.
 *
 * @param {File} file
 * @param {string} key — photo bucket key (e.g. "photo_{room}_fixture")
 * @param {Record<string, unknown>} meta — metadata stored alongside the blob
 * @param {object} storage — window.auditStorage
 * @param {(file: File) => Promise<Blob>} compressToBlob
 * @returns {Promise<string|null>} — blob ID string or null on failure
 */
export async function capturePhotoBlob(file, key, meta, storage, compressToBlob) {
  if (!storage) return null;
  const blob = await compressToBlob(file);
  if (!blob) return null;
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  await storage.putBlob(id, blob, { key, ...meta });
  return blobId(id);
}

// Expose on window for non-module scripts
if (typeof window !== 'undefined') {
  window.photoStore = {
    BLOB_PREFIX,
    blobId,
    isBlobId,
    resolvePhotoSrc,
    migratePhotosToBlobs,
    capturePhotoBlob,
  };
}
