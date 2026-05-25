/**
 * Tests for html_app/storage.js IndexedDB module (US-030).
 *
 * fake-indexeddb/auto patches globalThis.indexedDB so the module functions
 * work in the vitest/jsdom environment without a real browser.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';

// Import directly from html_app via @html-app alias (configured in vitest.config.ts).
import {
  deleteBlob,
  getBlob,
  getJSON,
  listBlobs,
  putBlob,
  setJSON,
} from '@html-app/storage.js';

// Reset IndexedDB state between tests by deleting and re-opening the DB.
afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('auditDB');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

describe('getJSON / setJSON', () => {
  it('returns undefined for missing key', async () => {
    const val = await getJSON('missing');
    expect(val).toBeUndefined();
  });

  it('stores and retrieves a value', async () => {
    await setJSON('audit:123', { rooms: 5 });
    const val = await getJSON('audit:123');
    expect(val).toEqual({ rooms: 5 });
  });

  it('overwrites an existing value (upsert)', async () => {
    await setJSON('key', 'first');
    await setJSON('key', 'second');
    const val = await getJSON('key');
    expect(val).toBe('second');
  });

  it('stores primitive values', async () => {
    await setJSON('count', 42);
    expect(await getJSON('count')).toBe(42);
  });
});

describe('putBlob / getBlob', () => {
  it('returns undefined for missing blob id', async () => {
    const row = await getBlob('no-such-id');
    expect(row).toBeUndefined();
  });

  it('stores and retrieves a blob with meta', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    await putBlob('photo-1', blob, { photoType: 'fixture' });
    const row = await getBlob('photo-1');
    expect(row).toBeDefined();
    expect(row!.id).toBe('photo-1');
    expect(row!.meta).toEqual({ photoType: 'fixture' });
    // fake-indexeddb stores blobs as plain objects; just verify the field exists
    expect(row!.blob).toBeDefined();
  });

  it('stores blob without meta (defaults to empty object)', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    await putBlob('raw-1', blob);
    const row = await getBlob('raw-1');
    expect(row!.meta).toEqual({});
  });

  it('overwrites existing blob (upsert)', async () => {
    const b1 = new Blob(['old']);
    const b2 = new Blob(['new']);
    await putBlob('dup', b1, { v: 1 });
    await putBlob('dup', b2, { v: 2 });
    const row = await getBlob('dup');
    expect(row!.meta).toEqual({ v: 2 });
  });
});

describe('listBlobs', () => {
  it('returns empty array when no blobs stored', async () => {
    const all = await listBlobs();
    expect(all).toEqual([]);
  });

  it('returns all blobs without filter', async () => {
    await putBlob('a', new Blob(['a']), { type: 'fixture' });
    await putBlob('b', new Blob(['b']), { type: 'panorama' });
    const all = await listBlobs();
    expect(all).toHaveLength(2);
  });

  it('filters blobs by meta predicate', async () => {
    await putBlob('a', new Blob(['a']), { type: 'fixture' });
    await putBlob('b', new Blob(['b']), { type: 'panorama' });
    const fixtures = await listBlobs((meta: Record<string, unknown>) => meta['type'] === 'fixture');
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].id).toBe('a');
  });
});

describe('deleteBlob', () => {
  it('removes a stored blob', async () => {
    await putBlob('del-me', new Blob(['x']));
    await deleteBlob('del-me');
    const row = await getBlob('del-me');
    expect(row).toBeUndefined();
  });

  it('does not throw when deleting a non-existent blob', async () => {
    await expect(deleteBlob('ghost')).resolves.toBeUndefined();
  });
});
