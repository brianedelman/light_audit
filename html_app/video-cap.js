/**
 * video-cap.js — Video capture validation for the Audit PWA.
 *
 * Provides:
 *   checkVideoDuration(file, maxSecs, createVideoEl) — resolves to
 *     { ok: boolean, duration: number } after reading video metadata.
 *
 *   MAX_VIDEO_SECS — the default max duration (30 seconds).
 *
 * Panoramas (photo_type='panorama') are excluded from the duration check and
 * from compression — see captureWithPolicy().
 */

export const MAX_VIDEO_SECS = 30;

/**
 * Check if a video file's duration is within the allowed limit.
 *
 * Loads the file into a temporary <video> element to read metadata.
 *
 * @param {File|Blob} file
 * @param {number} [maxSecs=MAX_VIDEO_SECS]
 * @param {() => HTMLVideoElement} [createVideoEl] — injectable factory for testing
 * @returns {Promise<{ok: boolean, duration: number}>}
 */
export function checkVideoDuration(file, maxSecs = MAX_VIDEO_SECS, createVideoEl, createObjectUrl) {
  return new Promise((resolve, reject) => {
    const video = createVideoEl ? createVideoEl() : document.createElement('video');
    const makeUrl = createObjectUrl || (typeof URL !== 'undefined' && URL.createObjectURL
      ? URL.createObjectURL.bind(URL)
      : null);
    if (!makeUrl) {
      reject(new Error('URL.createObjectURL not available'));
      return;
    }
    const url = makeUrl(file);

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = '';
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    };

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      resolve({ ok: isFinite(duration) && duration <= maxSecs, duration: duration || 0 });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Could not read video metadata'));
    };
    video.src = url;
  });
}

/**
 * Capture a file (photo or video) applying the correct policy:
 *   - Panoramas: stored as-is (no compression).
 *   - Videos: duration-checked; rejected if > maxSecs.
 *   - Other images: compressed via the provided compressToBlob function.
 *
 * Returns null if the file is rejected (e.g., video too long or unsupported).
 *
 * @param {File} file
 * @param {string} photoType — 'fixture' | 'switch' | 'controls' | 'panorama' | 'video' | 'room'
 * @param {object} opts
 * @param {number} [opts.maxVideoSecs=MAX_VIDEO_SECS]
 * @param {(file: File) => Promise<Blob>} [opts.compressToBlob] — compression function
 * @param {() => HTMLVideoElement} [opts._createVideoEl] — injectable for tests
 * @returns {Promise<{blob: Blob, rejected: boolean, reason: string|null}>}
 */
export async function captureWithPolicy(file, photoType, opts = {}) {
  const { maxVideoSecs = MAX_VIDEO_SECS, compressToBlob, _createVideoEl, _createObjectUrl } = opts;

  const isVideo = file.type && file.type.startsWith('video/');
  const isImage = file.type && file.type.startsWith('image/');
  const isPanorama = photoType === 'panorama';

  if (isVideo) {
    // Check duration
    let check;
    try {
      check = await checkVideoDuration(file, maxVideoSecs, _createVideoEl, _createObjectUrl);
    } catch {
      return { blob: null, rejected: true, reason: 'Could not read video duration' };
    }
    if (!check.ok) {
      const secs = Math.round(check.duration);
      return {
        blob: null,
        rejected: true,
        reason: `Video too long (${secs}s) — max ${maxVideoSecs} seconds`,
      };
    }
    // Accepted video: store as-is (no image compression)
    return { blob: file, rejected: false, reason: null };
  }

  if (isPanorama) {
    // Panoramas: skip compression, store original
    return { blob: file, rejected: false, reason: null };
  }

  // Reject non-image, non-video files
  if (!isImage) {
    return { blob: null, rejected: true, reason: `Unsupported file type: ${file.type || 'unknown'}` };
  }

  // Regular image: compress
  if (compressToBlob) {
    const blob = await compressToBlob(file);
    return { blob: blob || file, rejected: false, reason: null };
  }

  return { blob: file, rejected: false, reason: null };
}

// Expose on window for non-module scripts
if (typeof window !== 'undefined') {
  window.videoCap = { checkVideoDuration, captureWithPolicy, MAX_VIDEO_SECS };
}
