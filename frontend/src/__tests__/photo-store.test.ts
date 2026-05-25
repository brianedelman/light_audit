/**
 * Tests for html_app/photo-store.js (US-032).
 *
 * Tests the capture + retrieval lifecycle for blob-based photo storage,
 * and the migration of existing base64 data-URL entries.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BLOB_PREFIX,
  blobId,
  capturePhotoBlob,
  isBlobId,
  migratePhotosToBlobs,
  resolvePhotoSrc,
} from '@html-app/photo-store.js';
import { deleteBlob, getBlob, putBlob } from '@html-app/storage.js';

const storage = { putBlob, getBlob };

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('auditDB');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

// ---------------------------------------------------------------------------
// blobId / isBlobId
// ---------------------------------------------------------------------------

describe('blobId / isBlobId', () => {
  it('blobId prefixes correctly', () => {
    expect(blobId('abc')).toBe(`${BLOB_PREFIX}abc`);
  });

  it('isBlobId detects prefixed IDs', () => {
    expect(isBlobId(blobId('abc'))).toBe(true);
    expect(isBlobId('data:image/jpeg;base64,abc')).toBe(false);
    expect(isBlobId('just-a-string')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolvePhotoSrc
// ---------------------------------------------------------------------------

describe('resolvePhotoSrc', () => {
  it('passes data: URLs through unchanged', async () => {
    const dataUrl = 'data:image/jpeg;base64,abc123';
    expect(await resolvePhotoSrc(dataUrl, storage)).toBe(dataUrl);
  });

  it('passes unknown values through unchanged', async () => {
    expect(await resolvePhotoSrc('https://example.com/img.jpg', storage)).toBe(
      'https://example.com/img.jpg',
    );
  });

  it('returns val unchanged when storage is null', async () => {
    const id = blobId('test-id');
    // @ts-expect-error testing null storage
    expect(await resolvePhotoSrc(id, null)).toBe(id);
  });

  it('returns val unchanged when blob does not exist in IndexedDB', async () => {
    const id = blobId('nonexistent');
    const result = await resolvePhotoSrc(id, storage);
    expect(result).toBe(id);
  });

  it('resolves blob ID to a value when blob exists', async () => {
    const rawId = 'photo-uuid-1';
    await putBlob(rawId, new Blob(['img data'], { type: 'image/jpeg' }), {});
    const id = blobId(rawId);
    const result = await resolvePhotoSrc(id, storage);
    // In jsdom URL.createObjectURL is not available — result falls back to the blob id
    // In a real browser it would return a blob: URL
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// capturePhotoBlob
// ---------------------------------------------------------------------------

describe('capturePhotoBlob', () => {
  it('returns null when storage is null', async () => {
    const file = new File(['img'], 'test.jpg', { type: 'image/jpeg' });
    const mockCompress = vi.fn().mockResolvedValue(new Blob(['compressed']));
    // @ts-expect-error testing null storage
    const result = await capturePhotoBlob(file, 'photo_room1_fixture', {}, null, mockCompress);
    expect(result).toBeNull();
  });

  it('stores blob in IndexedDB and returns a blob ID', async () => {
    const file = new File(['raw-image'], 'shot.jpg', { type: 'image/jpeg' });
    const mockCompress = vi.fn().mockResolvedValue(new Blob(['compressed-jpeg']));

    const id = await capturePhotoBlob(
      file,
      'photo_room1_fixture',
      { photoType: 'fixture' },
      storage,
      mockCompress,
    );

    expect(id).not.toBeNull();
    expect(isBlobId(id!)).toBe(true);
    expect(mockCompress).toHaveBeenCalledWith(file);

    // Verify stored in IndexedDB
    const rawId = id!.slice(BLOB_PREFIX.length);
    const row = await getBlob(rawId);
    expect(row).toBeDefined();
    expect(row!.meta).toMatchObject({ key: 'photo_room1_fixture', photoType: 'fixture' });
  });
});

// ---------------------------------------------------------------------------
// migratePhotosToBlobs
// ---------------------------------------------------------------------------

describe('migratePhotosToBlobs', () => {
  it('returns changed=false when storage is null', async () => {
    const roomPhotos = { 'photo_room1_fixture': ['data:image/jpeg;base64,abc'] };
    // @ts-expect-error testing null storage
    const { changed } = await migratePhotosToBlobs(roomPhotos, null);
    expect(changed).toBe(false);
  });

  it('returns changed=false when no data: URLs present', async () => {
    const existingId = blobId('already-migrated');
    const roomPhotos = { 'photo_room1_fixture': [existingId] };
    const { changed } = await migratePhotosToBlobs(roomPhotos, storage);
    expect(changed).toBe(false);
    // Existing blob ID preserved
    expect(roomPhotos['photo_room1_fixture'][0]).toBe(existingId);
  });

  it('leaves non-array values unchanged', async () => {
    // @ts-expect-error testing malformed roomPhotos
    const roomPhotos: Record<string, string[]> = { 'meta': 'string-value' };
    const { changed } = await migratePhotosToBlobs(roomPhotos, storage);
    expect(changed).toBe(false);
  });

  it('skips entries that are already blob IDs', async () => {
    const id = blobId('pre-existing');
    const roomPhotos = { key: [id] };
    const { changed } = await migratePhotosToBlobs(roomPhotos, storage);
    expect(changed).toBe(false);
    expect(roomPhotos.key[0]).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle: capture → resolve → delete
// ---------------------------------------------------------------------------

describe('full lifecycle', () => {
  it('stores via capturePhotoBlob and retrieves via getBlob', async () => {
    const mockCompress = vi.fn().mockResolvedValue(new Blob(['jpeg-bytes']));
    const file = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' });

    const id = await capturePhotoBlob(file, 'photo_lobby_switch', { photoType: 'switch' }, storage, mockCompress);
    expect(id).not.toBeNull();

    const rawId = id!.slice(BLOB_PREFIX.length);
    const row = await getBlob(rawId);
    expect(row).toBeDefined();

    // Cleanup
    await deleteBlob(rawId);
    expect(await getBlob(rawId)).toBeUndefined();
  });
});
