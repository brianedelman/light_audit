/**
 * Tests for html_app/sync-drain.js (US-036).
 *
 * All HTTP and queue dependencies are injected — no real fetch or IndexedDB needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncQueueItem } from '@html-app/sync-queue';

import {
  BACKOFF_SECS,
  drainOnce,
  getBackoffIdx,
  startDrain,
  stopDrain,
} from '@html-app/sync-drain.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueue(items: SyncQueueItem[] = []) {
  const store = [...items];
  return {
    peek: vi.fn(async () => store.slice()),
    markDone: vi.fn(async (id: number) => {
      const idx = store.findIndex((i) => i.id === id);
      if (idx !== -1) store.splice(idx, 1);
    }),
    markFailed: vi.fn(async (id: number, err: string) => {
      const item = store.find((i) => i.id === id);
      if (item) {
        item.retry_count = (item.retry_count || 0) + 1;
        item.last_error = err;
      }
    }),
  };
}

function item(overrides: Partial<SyncQueueItem> & { id: number; type: 'audit' | 'media' }): SyncQueueItem {
  return { retry_count: 0, last_error: null, ...overrides };
}

afterEach(() => {
  stopDrain();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// BACKOFF_SECS shape
// ---------------------------------------------------------------------------

it('BACKOFF_SECS starts at 10 and ends at 600', () => {
  expect(BACKOFF_SECS[0]).toBe(10);
  expect(BACKOFF_SECS[BACKOFF_SECS.length - 1]).toBe(600);
});

// ---------------------------------------------------------------------------
// drainOnce — audit items
// ---------------------------------------------------------------------------

describe('drainOnce — audit', () => {
  it('POSTs audit payload to /api/audits/sync', async () => {
    const payload = { building_uuid: 'b1', payload: { floors: [] } };
    const queue = makeQueue([item({ id: 1, type: 'audit', payload })]);
    const post = vi.fn(async () => ({ version_id: 1, created: true }));

    await drainOnce({ queue, post });

    expect(post).toHaveBeenCalledWith('/api/audits/sync', payload);
  });

  it('calls markDone on success', async () => {
    const queue = makeQueue([item({ id: 1, type: 'audit', payload: {} })]);
    const post = vi.fn(async () => ({}));

    await drainOnce({ queue, post });

    expect(queue.markDone).toHaveBeenCalledWith(1);
    expect(queue.markFailed).not.toHaveBeenCalled();
  });

  it('calls markFailed when POST throws', async () => {
    const queue = makeQueue([item({ id: 2, type: 'audit', payload: {} })]);
    const post = vi.fn(async () => { throw new Error('network'); });

    const result = await drainOnce({ queue, post });

    expect(result.failed).toBe(1);
    expect(queue.markFailed).toHaveBeenCalledWith(2, expect.stringContaining('network'));
    expect(queue.markDone).not.toHaveBeenCalled();
  });

  it('returns correct processed/failed counts', async () => {
    const queue = makeQueue([
      item({ id: 1, type: 'audit', payload: {} }),
      item({ id: 2, type: 'audit', payload: {} }),
      item({ id: 3, type: 'audit', payload: {} }),
    ]);
    let calls = 0;
    const post = vi.fn(async () => {
      calls++;
      if (calls === 2) throw new Error('fail');
      return {};
    });

    const result = await drainOnce({ queue, post });

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// drainOnce — media items
// ---------------------------------------------------------------------------

describe('drainOnce — media', () => {
  const mockBlob = new Blob(['video'], { type: 'video/mp4' });

  it('calls start → sign-part → complete for a media item', async () => {
    const queue = makeQueue([
      item({
        id: 10,
        type: 'media',
        blob_id: 'b-abc',
        meta: { building_id: 5, filename: 'clip.mp4', photo_type: 'video' },
      }),
    ]);

    const post = vi.fn(async (url: string) => {
      if (url.includes('start')) return { photo_id: 99, upload_id: 'up1', storage_path: 'p' };
      if (url.includes('sign-part')) return { presigned_url: 'https://r2/presigned' };
      if (url.includes('complete')) return { photo_id: 99, public_url: 'https://r2/clip.mp4' };
      return {};
    });
    const uploadPart = vi.fn(async () => '"etag123"');
    const getBlob = vi.fn(async () => ({ blob: mockBlob, meta: {} }));

    await drainOnce({ queue, post, uploadPart, getBlob });

    expect(post).toHaveBeenCalledWith('/api/media/multipart/start', expect.objectContaining({ photo_type: 'video' }));
    expect(post).toHaveBeenCalledWith('/api/media/multipart/sign-part', expect.objectContaining({ photo_id: 99 }));
    expect(post).toHaveBeenCalledWith('/api/media/multipart/complete', expect.objectContaining({ photo_id: 99 }));
    expect(uploadPart).toHaveBeenCalledWith('https://r2/presigned', expect.any(Blob));
    expect(queue.markDone).toHaveBeenCalledWith(10);
  });

  it('marks failed when blob is not found', async () => {
    const queue = makeQueue([
      item({ id: 11, type: 'media', blob_id: 'missing', meta: {} }),
    ]);
    const post = vi.fn();
    const getBlob = vi.fn(async () => undefined);

    const result = await drainOnce({ queue, post, getBlob });

    expect(result.failed).toBe(1);
    expect(queue.markFailed).toHaveBeenCalledWith(11, expect.stringContaining('missing'));
  });
});

// ---------------------------------------------------------------------------
// drainOnce — empty queue
// ---------------------------------------------------------------------------

it('drainOnce returns 0/0 for empty queue', async () => {
  const queue = makeQueue([]);
  const result = await drainOnce({ queue, post: vi.fn() });
  expect(result).toEqual({ processed: 0, failed: 0 });
});

// ---------------------------------------------------------------------------
// startDrain / stopDrain / backoff
// ---------------------------------------------------------------------------

describe('startDrain', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopDrain();
    vi.useRealTimers();
  });

  it('is idempotent — calling twice does not double-schedule', async () => {
    const queue = makeQueue([]);
    startDrain({ queue, post: vi.fn(), initialDelayMs: 0 });
    startDrain({ queue, post: vi.fn(), initialDelayMs: 0 });

    // Run only the first tick — _tick calls peek 3x (status, drainOnce, status after)
    await vi.advanceTimersByTimeAsync(1);

    // Only one tick's worth of peeks (not doubled)
    const peeksPerTick = 3;
    expect(queue.peek).toHaveBeenCalledTimes(peeksPerTick);
  });

  it('schedules next tick after BACKOFF_SECS[0] on clean drain', async () => {
    const queue = makeQueue([]);
    const post = vi.fn(async () => ({}));
    startDrain({ queue, post, initialDelayMs: 0 });

    // First tick
    await vi.advanceTimersByTimeAsync(1);
    const callsAfterFirst = queue.peek.mock.calls.length;

    // Advance by exactly BACKOFF_SECS[0] seconds — should trigger second tick
    await vi.advanceTimersByTimeAsync(BACKOFF_SECS[0] * 1000);

    // Second tick added more peek calls
    expect(queue.peek.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('increases backoff index after failed drain', async () => {
    const queue = makeQueue([item({ id: 1, type: 'audit', payload: {} })]);
    const post = vi.fn(async () => { throw new Error('fail'); });
    startDrain({ queue, post, initialDelayMs: 0 });

    await vi.advanceTimersByTimeAsync(1);

    expect(getBackoffIdx()).toBe(1);
  });

  it('resets backoff to 0 after successful drain', async () => {
    // First: fail to build up backoff
    let shouldFail = true;
    const queue = makeQueue([item({ id: 1, type: 'audit', payload: {} })]);
    const post = vi.fn(async () => {
      if (shouldFail) throw new Error('fail');
      return {};
    });

    startDrain({ queue, post, initialDelayMs: 0 });

    // First tick — fails
    await vi.advanceTimersByTimeAsync(1);
    expect(getBackoffIdx()).toBe(1);

    // Now succeed — mock peek to return a fresh item
    shouldFail = false;
    queue.peek.mockResolvedValue([item({ id: 2, type: 'audit', payload: {} })]);

    // Advance by BACKOFF_SECS[1] to trigger second tick
    await vi.advanceTimersByTimeAsync(BACKOFF_SECS[1] * 1000);

    expect(getBackoffIdx()).toBe(0);
  });

  it('stopDrain cancels the loop', async () => {
    const queue = makeQueue([]);
    startDrain({ queue, post: vi.fn(), initialDelayMs: 0 });

    // Run first tick
    await vi.advanceTimersByTimeAsync(1);
    stopDrain();

    const callsAfterStop = queue.peek.mock.calls.length;

    // Advance far — no more ticks should fire
    await vi.advanceTimersByTimeAsync(BACKOFF_SECS[0] * 1000 * 10);

    expect(queue.peek).toHaveBeenCalledTimes(callsAfterStop);
  });
});
