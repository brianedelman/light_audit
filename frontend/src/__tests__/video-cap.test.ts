/**
 * Tests for html_app/video-cap.js (US-034).
 *
 * checkVideoDuration uses HTMLVideoElement.onloadedmetadata which can't run in
 * jsdom without a real browser. We inject a mock video element factory to make
 * the function testable.
 */
import { describe, expect, it, vi } from 'vitest';

import { MAX_VIDEO_SECS, captureWithPolicy, checkVideoDuration } from '@html-app/video-cap.js';

// Provide a stable URL factory for tests to avoid jsdom URL.createObjectURL issues
const mockCreateObjectUrl = () => 'blob:mock-url';

// ---------------------------------------------------------------------------
// Mock video element factory
// ---------------------------------------------------------------------------

function makeVideoEl(duration: number, errorAfterMs?: number): () => HTMLVideoElement {
  return () => {
    const el: Partial<HTMLVideoElement> & {
      _url?: string;
      onloadedmetadata: (() => void) | null;
      onerror: (() => void) | null;
    } = {
      duration,
      preload: '',
      onloadedmetadata: null,
      onerror: null,
      set src(url: string) {
        this._url = url;
        if (errorAfterMs !== undefined) {
          setTimeout(() => this.onerror?.(), errorAfterMs);
        } else {
          // Fire loadedmetadata synchronously (simplest for tests)
          Promise.resolve().then(() => this.onloadedmetadata?.());
        }
      },
    };
    return el as unknown as HTMLVideoElement;
  };
}

// ---------------------------------------------------------------------------
// MAX_VIDEO_SECS
// ---------------------------------------------------------------------------

it('MAX_VIDEO_SECS is 30', () => {
  expect(MAX_VIDEO_SECS).toBe(30);
});

// ---------------------------------------------------------------------------
// checkVideoDuration
// ---------------------------------------------------------------------------

describe('checkVideoDuration', () => {
  it('accepts a video under the limit', async () => {
    const file = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
    const result = await checkVideoDuration(file, 30, makeVideoEl(15), mockCreateObjectUrl);
    expect(result.ok).toBe(true);
    expect(result.duration).toBe(15);
  });

  it('accepts a video exactly at the limit', async () => {
    const file = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
    const result = await checkVideoDuration(file, 30, makeVideoEl(30), mockCreateObjectUrl);
    expect(result.ok).toBe(true);
  });

  it('rejects a video over the limit', async () => {
    const file = new File(['v'], 'long.mp4', { type: 'video/mp4' });
    const result = await checkVideoDuration(file, 30, makeVideoEl(45), mockCreateObjectUrl);
    expect(result.ok).toBe(false);
    expect(result.duration).toBe(45);
  });

  it('rejects a video with infinite duration', async () => {
    const file = new File(['v'], 'live.mp4', { type: 'video/mp4' });
    const result = await checkVideoDuration(file, 30, makeVideoEl(Infinity), mockCreateObjectUrl);
    expect(result.ok).toBe(false);
  });

  it('rejects when video errors during load', async () => {
    const file = new File(['v'], 'bad.mp4', { type: 'video/mp4' });
    await expect(
      checkVideoDuration(file, 30, makeVideoEl(0, 0), mockCreateObjectUrl),
    ).rejects.toThrow('Could not read video metadata');
  });

  it('uses custom maxSecs when provided', async () => {
    const file = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
    const under = await checkVideoDuration(file, 60, makeVideoEl(45), mockCreateObjectUrl);
    expect(under.ok).toBe(true);
    const over = await checkVideoDuration(file, 20, makeVideoEl(45), mockCreateObjectUrl);
    expect(over.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// captureWithPolicy
// ---------------------------------------------------------------------------

describe('captureWithPolicy', () => {
  const mockCompress = vi.fn().mockImplementation((_f: File) =>
    Promise.resolve(new Blob(['compressed'], { type: 'image/jpeg' })),
  );

  it('compresses regular image files', async () => {
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    const result = await captureWithPolicy(file, 'fixture', { compressToBlob: mockCompress });
    expect(result.rejected).toBe(false);
    expect(result.blob).toBeDefined();
    expect(mockCompress).toHaveBeenCalledWith(file);
  });

  it('skips compression for panoramas', async () => {
    const compress = vi.fn();
    const file = new File(['img'], 'panorama.jpg', { type: 'image/jpeg' });
    const result = await captureWithPolicy(file, 'panorama', { compressToBlob: compress });
    expect(result.rejected).toBe(false);
    expect(compress).not.toHaveBeenCalled();
    expect(result.blob).toBe(file); // original returned
  });

  it('accepts a short video', async () => {
    const file = new File(['v'], 'short.mp4', { type: 'video/mp4' });
    const result = await captureWithPolicy(file, 'video', {
      _createVideoEl: makeVideoEl(10),
      _createObjectUrl: mockCreateObjectUrl,
    });
    expect(result.rejected).toBe(false);
    expect(result.blob).toBe(file); // videos stored as-is
  });

  it('rejects a video over 30s', async () => {
    const file = new File(['v'], 'long.mp4', { type: 'video/mp4' });
    const result = await captureWithPolicy(file, 'video', {
      _createVideoEl: makeVideoEl(60),
      _createObjectUrl: mockCreateObjectUrl,
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/too long/i);
    expect(result.blob).toBeNull();
  });

  it('rejects a video when metadata cannot be read', async () => {
    const file = new File(['v'], 'bad.mp4', { type: 'video/mp4' });
    const result = await captureWithPolicy(file, 'video', {
      _createVideoEl: makeVideoEl(0, 0),
      _createObjectUrl: mockCreateObjectUrl,
    });
    expect(result.rejected).toBe(true);
    expect(result.reason).toMatch(/duration/i);
  });

  it('rejects non-image non-video files', async () => {
    const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' });
    const result = await captureWithPolicy(file, 'fixture', {});
    expect(result.rejected).toBe(true);
    expect(result.blob).toBeNull();
  });
});
