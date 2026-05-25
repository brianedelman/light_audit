/**
 * Tests for html_app/sync-queue.js (US-035).
 *
 * fake-indexeddb/auto patches globalThis.indexedDB for jsdom.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';

import {
  enqueueAudit,
  enqueueMedia,
  markDone,
  markFailed,
  peek,
} from '@html-app/sync-queue.js';

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('auditDB');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

// ---------------------------------------------------------------------------
// enqueueAudit / enqueueMedia
// ---------------------------------------------------------------------------

describe('enqueue', () => {
  it('enqueueAudit returns a numeric id', async () => {
    const id = await enqueueAudit({ foo: 'bar' });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('enqueueMedia returns a numeric id', async () => {
    const id = await enqueueMedia('blob-abc', { room: '1' });
    expect(typeof id).toBe('number');
  });

  it('enqueued items appear in peek()', async () => {
    await enqueueAudit({ a: 1 });
    await enqueueMedia('blob-xyz');
    const items = await peek();
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('audit');
    expect(items[1].type).toBe('media');
  });

  it('audit item has correct payload', async () => {
    const payload = { project: 'p1', rooms: [] };
    await enqueueAudit(payload);
    const [item] = await peek();
    expect(item.payload).toEqual(payload);
    expect(item.blob_id).toBeUndefined();
  });

  it('media item has correct blob_id and meta', async () => {
    await enqueueMedia('blob-123', { room: 'r2', photoType: 'fixture' });
    const [item] = await peek();
    expect(item.blob_id).toBe('blob-123');
    expect(item.meta).toEqual({ room: 'r2', photoType: 'fixture' });
  });

  it('new items start with retry_count=0 and last_error=null', async () => {
    await enqueueAudit({ x: 1 });
    const [item] = await peek();
    expect(item.retry_count).toBe(0);
    expect(item.last_error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// drain order
// ---------------------------------------------------------------------------

describe('drain order', () => {
  it('peek returns items oldest-first', async () => {
    const id1 = await enqueueAudit({ seq: 1 });
    const id2 = await enqueueAudit({ seq: 2 });
    const id3 = await enqueueMedia('b3');
    const items = await peek();
    expect(items.map((i) => i.id)).toEqual([id1, id2, id3]);
  });
});

// ---------------------------------------------------------------------------
// markDone
// ---------------------------------------------------------------------------

describe('markDone', () => {
  it('removes the item from the queue', async () => {
    const id = await enqueueAudit({ done: true });
    await markDone(id);
    const items = await peek();
    expect(items.find((i) => i.id === id)).toBeUndefined();
  });

  it('does not affect other items', async () => {
    const id1 = await enqueueAudit({ a: 1 });
    const id2 = await enqueueAudit({ b: 2 });
    await markDone(id1);
    const items = await peek();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(id2);
  });

  it('is a no-op for unknown id', async () => {
    await expect(markDone(9999)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// markFailed
// ---------------------------------------------------------------------------

describe('markFailed', () => {
  it('increments retry_count', async () => {
    const id = await enqueueAudit({ fail: true });
    await markFailed(id, 'network error');
    const [item] = await peek();
    expect(item.retry_count).toBe(1);
  });

  it('records last_error', async () => {
    const id = await enqueueAudit({ fail: true });
    await markFailed(id, 'timeout');
    const [item] = await peek();
    expect(item.last_error).toBe('timeout');
  });

  it('accumulates retry_count across multiple failures', async () => {
    const id = await enqueueAudit({ x: 1 });
    await markFailed(id, 'err1');
    await markFailed(id, 'err2');
    await markFailed(id, 'err3');
    const [item] = await peek();
    expect(item.retry_count).toBe(3);
    expect(item.last_error).toBe('err3');
  });

  it('item remains in queue after failure', async () => {
    const id = await enqueueAudit({ keep: true });
    await markFailed(id, 'boom');
    const items = await peek();
    expect(items.find((i) => i.id === id)).toBeDefined();
  });

  it('is a no-op for unknown id', async () => {
    await expect(markFailed(9999, 'err')).resolves.toBeUndefined();
  });
});
