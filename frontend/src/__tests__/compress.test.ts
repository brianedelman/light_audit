/**
 * Tests for html_app/compress.js (US-033).
 *
 * Tests EXIF timestamp extraction and the compressToTarget fast path.
 * Canvas-based compression is not fully testable in jsdom (toBlob returns null),
 * so we focus on the EXIF parser and the size-under-target fast path.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX_BYTES, compressToTarget, extractExifTimestamp } from '@html-app/compress.js';

// ---------------------------------------------------------------------------
// Helpers to build synthetic JPEG EXIF data
// ---------------------------------------------------------------------------

/**
 * Encode a TIFF date string "YYYY:MM:DD HH:MM:SS\x00" (20 bytes total).
 */
function encodeTiffDate(date: Date): Uint8Array {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const str =
    `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}\x00`;
  return new TextEncoder().encode(str);
}

/**
 * Build a minimal JPEG buffer with EXIF APP1 segment containing a DateTime tag.
 * Supports IFD0-level DateTime (0x0132) only for simplicity.
 */
function buildJpegWithExif(date: Date): ArrayBuffer {
  const dateBytes = encodeTiffDate(date); // 20 bytes

  // TIFF IFD entry for tag 0x0132 (DateTime), type ASCII (2), count 20
  // Value > 4 bytes, so value is an offset into the TIFF block
  // IFD structure (little-endian):
  //   2 bytes: entry count (1)
  //   12 bytes per entry: tag (2), type (2), count (4), offset (4)
  //   4 bytes: next IFD offset (0 = none)
  //   then the date string data

  const ifdOffset = 8; // IFD starts at byte 8 of TIFF block (after TIFF header)
  const entryCount = 1;
  const dateDataOffset = ifdOffset + 2 + entryCount * 12 + 4; // after IFD + next-IFD word

  const tiffSize = dateDataOffset + dateBytes.length;
  const tiff = new ArrayBuffer(tiffSize);
  const tv = new DataView(tiff);

  // TIFF header (little-endian)
  tv.setUint16(0, 0x4949, true); // "II" — little-endian
  tv.setUint16(2, 0x002a, true); // TIFF magic
  tv.setUint32(4, ifdOffset, true); // offset to IFD0

  // IFD0
  tv.setUint16(ifdOffset, entryCount, true);
  const ep = ifdOffset + 2;
  tv.setUint16(ep, 0x0132, true);    // tag: DateTime
  tv.setUint16(ep + 2, 2, true);     // type: ASCII
  tv.setUint32(ep + 4, 20, true);    // count: 20
  tv.setUint32(ep + 8, dateDataOffset, true); // value offset
  tv.setUint32(ep + 12, 0, true);    // next IFD = none

  // Date data
  new Uint8Array(tiff).set(dateBytes, dateDataOffset);

  // Wrap in JPEG APP1 segment
  const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
  const app1PayloadSize = exifHeader.length + tiff.byteLength;
  const app1SegLen = 2 + app1PayloadSize; // includes the 2-byte length field itself

  const total = 2 + 2 + 2 + app1PayloadSize + 2; // SOI + marker + len + payload + EOI
  const buf = new ArrayBuffer(total);
  const bv = new DataView(buf);
  const ba = new Uint8Array(buf);

  let pos = 0;
  bv.setUint16(pos, 0xffd8); pos += 2; // SOI
  bv.setUint16(pos, 0xffe1); pos += 2; // APP1 marker
  bv.setUint16(pos, app1SegLen); pos += 2; // segment length
  ba.set(exifHeader, pos); pos += exifHeader.length;
  ba.set(new Uint8Array(tiff), pos); pos += tiff.byteLength;
  bv.setUint16(pos, 0xffd9); // EOI

  return buf;
}

// ---------------------------------------------------------------------------
// extractExifTimestamp tests
// ---------------------------------------------------------------------------

describe('extractExifTimestamp', () => {
  it('returns null for non-JPEG content', async () => {
    const blob = new Blob(['not a jpeg'], { type: 'image/jpeg' });
    expect(await extractExifTimestamp(blob)).toBeNull();
  });

  it('returns null for JPEG without EXIF', async () => {
    // Minimal JPEG: SOI + EOI only
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
    const blob = new Blob([buf]);
    expect(await extractExifTimestamp(blob)).toBeNull();
  });

  it('extracts DateTime from a synthetic JPEG EXIF block', async () => {
    const expected = new Date(2024, 5, 15, 10, 30, 45); // 2024-06-15 10:30:45
    const buf = buildJpegWithExif(expected);
    const blob = new Blob([buf], { type: 'image/jpeg' });

    const result = await extractExifTimestamp(blob);
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2024);
    expect(result!.getMonth()).toBe(5); // June (0-indexed)
    expect(result!.getDate()).toBe(15);
    expect(result!.getHours()).toBe(10);
    expect(result!.getMinutes()).toBe(30);
    expect(result!.getSeconds()).toBe(45);
  });

  it('returns null for empty Blob', async () => {
    const blob = new Blob([]);
    expect(await extractExifTimestamp(blob)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// compressToTarget tests
// ---------------------------------------------------------------------------

describe('compressToTarget', () => {
  it('DEFAULT_MAX_BYTES is 2MB', () => {
    expect(DEFAULT_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it('fast-path: returns original blob when already under target size', async () => {
    const small = new Blob(['tiny image data'], { type: 'image/jpeg' });
    // small.size << 2MB, should pass through
    const result = await compressToTarget(small, DEFAULT_MAX_BYTES);
    expect(result.blob).toBeDefined();
    expect(result.blob.size).toBe(small.size);
  });

  it('includes timestamp field in result', async () => {
    const small = new Blob(['x'], { type: 'image/jpeg' });
    const result = await compressToTarget(small, DEFAULT_MAX_BYTES);
    // timestamp is null for non-EXIF data
    expect('timestamp' in result).toBe(true);
    expect(result.timestamp).toBeNull();
  });

  it('includes width + height in result', async () => {
    const small = new Blob(['x'], { type: 'image/jpeg' });
    const result = await compressToTarget(small);
    expect('width' in result).toBe(true);
    expect('height' in result).toBe(true);
  });

  it('preserves EXIF timestamp through compressToTarget', async () => {
    const expected = new Date(2023, 11, 1, 8, 0, 0); // 2023-12-01 08:00:00
    const buf = buildJpegWithExif(expected);
    const blob = new Blob([buf], { type: 'image/jpeg' });

    // Small enough to skip compression — fast path preserves timestamp
    const result = await compressToTarget(blob, DEFAULT_MAX_BYTES);
    expect(result.timestamp).not.toBeNull();
    expect(result.timestamp!.getFullYear()).toBe(2023);
    expect(result.timestamp!.getMonth()).toBe(11);
    expect(result.timestamp!.getDate()).toBe(1);
  });
});
