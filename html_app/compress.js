/**
 * compress.js — Client-side photo compression for the Audit PWA.
 *
 * Provides:
 *   extractExifTimestamp(file)  — returns Date (or null) from JPEG EXIF data
 *   compressToTarget(file, maxBytes) — resizes and compresses a photo to fit
 *     within the target byte size (~2MB default), returns { blob, timestamp }
 *
 * The raw EXIF parser reads DateTimeOriginal (0x9003) and DateTime (0x0132)
 * from JPEG APP1 markers without requiring an external exif-js dependency.
 */

export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

// ── EXIF Timestamp Extraction ─────────────────────────────────────────────

const EXIF_DATE_TAGS = [0x9003, 0x9004, 0x0132]; // DateTimeOriginal, DateTimeDigitized, DateTime

/**
 * Parse a TIFF-formatted date string "YYYY:MM:DD HH:MM:SS" to a Date object.
 * @param {string} s
 * @returns {Date|null}
 */
function _parseTiffDate(s) {
  // Format: "YYYY:MM:DD HH:MM:SS"
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    parseInt(m[6], 10),
  );
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Read a minimal EXIF IFD looking for timestamp tags.
 * @param {DataView} view
 * @param {number} ifdOffset — offset within the Exif TIFF block
 * @param {boolean} littleEndian
 * @param {number} tiffBase — byte offset of the TIFF header in `view`
 * @returns {Date|null}
 */
function _readIfdTimestamp(view, ifdOffset, littleEndian, tiffBase) {
  const entryCount = view.getUint16(tiffBase + ifdOffset, littleEndian);
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = tiffBase + ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, littleEndian);
    if (!EXIF_DATE_TAGS.includes(tag)) continue;
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    if (type !== 2) continue; // ASCII only
    const valueOffset =
      count <= 4
        ? entryOffset + 8
        : tiffBase + view.getUint32(entryOffset + 8, littleEndian);
    let str = '';
    for (let c = 0; c < count && c < 20; c++) {
      const code = view.getUint8(valueOffset + c);
      if (code === 0) break;
      str += String.fromCharCode(code);
    }
    const date = _parseTiffDate(str);
    if (date) return date;
  }
  return null;
}

/**
 * Extract timestamp from JPEG EXIF data using a raw ArrayBuffer parse.
 * Returns a Date if found, or null.
 * @param {File|Blob} file
 * @returns {Promise<Date|null>}
 */
export async function extractExifTimestamp(file) {
  try {
    const buf = await file.arrayBuffer();
    const view = new DataView(buf);
    // JPEG must start with 0xFFD8
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset);
      const segLen = view.getUint16(offset + 2);
      if (marker === 0xffe1) {
        // APP1 — check for Exif header "Exif\x00\x00"
        const headerStr =
          view.getUint8(offset + 4) === 0x45 && // E
          view.getUint8(offset + 5) === 0x78 && // x
          view.getUint8(offset + 6) === 0x69 && // i
          view.getUint8(offset + 7) === 0x66 && // f
          view.getUint8(offset + 8) === 0x00 &&
          view.getUint8(offset + 9) === 0x00;
        if (headerStr) {
          const tiffBase = offset + 10; // TIFF header starts here
          const byteOrder = view.getUint16(tiffBase);
          const littleEndian = byteOrder === 0x4949; // "II"
          const ifd0Offset = view.getUint32(tiffBase + 4, littleEndian);
          // IFD0 — may have DateTime (0x0132) directly
          const ts = _readIfdTimestamp(view, ifd0Offset, littleEndian, tiffBase);
          if (ts) return ts;
          // Look for SubExif IFD via tag 0x8769
          const entryCount = view.getUint16(tiffBase + ifd0Offset, littleEndian);
          for (let i = 0; i < entryCount; i++) {
            const ep = tiffBase + ifd0Offset + 2 + i * 12;
            if (ep + 12 > view.byteLength) break;
            const tag = view.getUint16(ep, littleEndian);
            if (tag === 0x8769) {
              const subIfdOffset = view.getUint32(ep + 8, littleEndian);
              const ts2 = _readIfdTimestamp(view, subIfdOffset, littleEndian, tiffBase);
              if (ts2) return ts2;
            }
          }
        }
      }
      if (segLen < 2) break;
      offset += 2 + segLen;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

// ── Compression ────────────────────────────────────────────────────────────

/**
 * Compress a photo file to approximately the target byte size.
 *
 * Strategy:
 *   1. Decode via Image element.
 *   2. If the image is already small enough, return the original file as Blob.
 *   3. Otherwise, resize to fit within MAX_DIM on the longest edge, then
 *      binary-search JPEG quality (0.5–0.95) until output fits within maxBytes.
 *
 * @param {File|Blob} file
 * @param {number} [maxBytes=DEFAULT_MAX_BYTES]
 * @returns {Promise<{blob: Blob, timestamp: Date|null, width: number, height: number}>}
 */
export async function compressToTarget(file, maxBytes = DEFAULT_MAX_BYTES) {
  const timestamp = await extractExifTimestamp(file);

  // Fast path: already small enough
  if (file.size <= maxBytes) {
    return {
      blob: file instanceof Blob ? file : new Blob([file]),
      timestamp,
      width: 0,
      height: 0,
    };
  }

  const dataUrl = await _fileToDataUrl(file);
  const img = await _loadImage(dataUrl);
  const { width, height } = _scaleDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, 4096);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  // Binary-search JPEG quality between 0.5 and 0.95 to hit the size target
  let lo = 0.5;
  let hi = 0.95;
  let bestBlob = null;
  for (let iter = 0; iter < 6; iter++) {
    const q = (lo + hi) / 2;
    const blob = await _canvasToBlob(canvas, q);
    if (blob.size <= maxBytes) {
      bestBlob = blob;
      lo = q; // can afford higher quality
    } else {
      hi = q; // need to reduce quality
    }
  }
  // If even lo=0.5 is too large, use it anyway (best effort)
  if (!bestBlob) {
    bestBlob = await _canvasToBlob(canvas, 0.5);
  }

  return { blob: bestBlob, timestamp, width, height };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function _loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function _scaleDimensions(w, h, maxDim) {
  if (!w || !h) return { width: maxDim, height: maxDim };
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

function _canvasToBlob(canvas, quality) {
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
}

// ── window export ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.auditCompress = { extractExifTimestamp, compressToTarget, DEFAULT_MAX_BYTES };
}
