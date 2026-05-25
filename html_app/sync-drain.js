/**
 * sync-drain.js — Polling loop that drains the offline sync queue.
 *
 * While the PWA is online and visible:
 *   - Audit items → POST /api/audits/sync
 *   - Media items → R2 multipart: start → sign-part → complete (per-part PUT)
 *
 * Exponential backoff on failure: 10s → 30s → 2m → 10m (resets on success).
 *
 * Usage:
 *   startDrain()   — begin polling (idempotent)
 *   stopDrain()    — cancel the loop
 *
 * Emits CustomEvent 'sync-status' on document with { queueLength, active }
 * so the UI can display a status indicator.
 */

export const BACKOFF_SECS = [10, 30, 120, 600];
const PART_SIZE = 5 * 1024 * 1024; // 5 MiB — R2 minimum part size

let _timer = null;
let _backoffIdx = 0;
let _active = false;

// ---------------------------------------------------------------------------
// HTTP helpers (injectable for tests)
// ---------------------------------------------------------------------------

async function _defaultPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': _getCsrf() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function _defaultUploadPart(presignedUrl, slice) {
  const res = await fetch(presignedUrl, { method: 'PUT', body: slice });
  if (!res.ok) throw new Error(`PUT part → ${res.status}`);
  return res.headers.get('ETag') || '';
}

function _getCsrf() {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? m[1] : '';
}

// ---------------------------------------------------------------------------
// Item processors
// ---------------------------------------------------------------------------

async function _drainAudit(item, { post = _defaultPost } = {}) {
  await post('/api/audits/sync', item.payload);
}

async function _drainMedia(item, {
  post = _defaultPost,
  uploadPart = _defaultUploadPart,
  getBlob = null,
} = {}) {
  const getBlobFn = getBlob || (typeof window !== 'undefined' && window.auditStorage?.getBlob);
  if (!getBlobFn) throw new Error('auditStorage.getBlob not available');

  const rec = await getBlobFn(item.blob_id);
  if (!rec) throw new Error(`Blob not found: ${item.blob_id}`);
  const blob = rec.blob || rec; // handle both {blob} and raw Blob
  const meta = item.meta || {};

  // Start multipart
  const { photo_id, storage_path } = await post('/api/media/multipart/start', {
    building_id: meta.building_id,
    filename: meta.filename || item.blob_id,
    mime_type: blob.type || 'application/octet-stream',
    photo_type: meta.photo_type || 'fixture',
  });

  // Split blob into parts and upload each
  const parts = [];
  const totalParts = Math.max(1, Math.ceil(blob.size / PART_SIZE));
  for (let i = 0; i < totalParts; i++) {
    const slice = blob.slice(i * PART_SIZE, (i + 1) * PART_SIZE);
    const { presigned_url } = await post('/api/media/multipart/sign-part', {
      photo_id,
      part_number: i + 1,
    });
    const etag = await uploadPart(presigned_url, slice);
    parts.push({ part_number: i + 1, etag });
  }

  // Complete
  await post('/api/media/multipart/complete', { photo_id, parts });
}

// ---------------------------------------------------------------------------
// Core drain pass
// ---------------------------------------------------------------------------

/**
 * Process all pending queue items once.
 * @param {object} opts — injectable dependencies for testing
 * @returns {Promise<{processed: number, failed: number}>}
 */
export async function drainOnce(opts = {}) {
  const {
    queue = null,
    post,
    uploadPart,
    getBlob,
  } = opts;

  const queueApi = queue || (typeof window !== 'undefined' && window.syncQueue);
  if (!queueApi) return { processed: 0, failed: 0 };

  const items = await queueApi.peek();
  let processed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      if (item.type === 'audit') {
        await _drainAudit(item, { post });
      } else if (item.type === 'media') {
        await _drainMedia(item, { post, uploadPart, getBlob });
      }
      await queueApi.markDone(item.id);
      processed++;
    } catch (err) {
      await queueApi.markFailed(item.id, String(err));
      failed++;
    }
  }

  return { processed, failed };
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

function _isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function _isVisible() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function _emitStatus(queueLength, active) {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(
    new CustomEvent('sync-status', { detail: { queueLength, active } }),
  );
}

async function _tick(opts = {}) {
  if (!_isOnline() || !_isVisible()) {
    _scheduleNext(opts);
    return;
  }

  _active = true;

  const queueApi = opts.queue || (typeof window !== 'undefined' && window.syncQueue);
  const pending = queueApi ? (await queueApi.peek()).length : 0;
  _emitStatus(pending, true);

  try {
    const { failed } = await drainOnce(opts);
    if (failed > 0) {
      _backoffIdx = Math.min(_backoffIdx + 1, BACKOFF_SECS.length - 1);
    } else {
      _backoffIdx = 0; // reset on clean pass
    }
  } catch {
    _backoffIdx = Math.min(_backoffIdx + 1, BACKOFF_SECS.length - 1);
  } finally {
    _active = false;
    const remaining = queueApi ? (await queueApi.peek()).length : 0;
    _emitStatus(remaining, false);
    _scheduleNext(opts);
  }
}

function _scheduleNext(opts) {
  if (_timer === null) return; // stopDrain() was called
  const delaySecs = BACKOFF_SECS[_backoffIdx];
  _timer = setTimeout(() => _tick(opts), delaySecs * 1000);
}

/**
 * Start the drain polling loop (idempotent — safe to call multiple times).
 * @param {object} [opts] — injectable dependencies for testing
 * @param {number} [opts.initialDelayMs=0] — delay before first tick (ms)
 */
export function startDrain(opts = {}) {
  if (_timer !== null) return; // already running
  _backoffIdx = 0;
  const { initialDelayMs = 0, ...rest } = opts;
  _timer = setTimeout(() => _tick(rest), initialDelayMs);
}

/**
 * Stop the polling loop.
 */
export function stopDrain() {
  if (_timer !== null) {
    clearTimeout(_timer);
    _timer = null;
  }
  _active = false;
}

/** Expose current backoff index (for testing / debugging). */
export function getBackoffIdx() {
  return _backoffIdx;
}

// Expose on window for non-module scripts
if (typeof window !== 'undefined') {
  window.syncDrain = { startDrain, stopDrain, drainOnce, getBackoffIdx, BACKOFF_SECS };
}
