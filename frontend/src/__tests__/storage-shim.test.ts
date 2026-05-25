/**
 * Tests for html_app/storage-shim.js (US-031).
 *
 * fake-indexeddb/auto patches globalThis.indexedDB.
 * We reset IndexedDB and localStorage between tests.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SENTINEL, __auditStorage, _boot, _cache } from '@html-app/storage-shim.js';

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

afterEach(async () => {
  // Clear in-memory cache
  _cache.clear();

  // Clear localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }

  // Delete and recreate the IndexedDB (reset to blank state)
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('auditDB');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

// ---------------------------------------------------------------------------
// Tests: getItem / setItem / removeItem (sync API)
// ---------------------------------------------------------------------------

describe('__auditStorage sync API', () => {
  beforeEach(async () => {
    await _boot();
  });

  it('returns null for missing key', () => {
    expect(__auditStorage.getItem('nope')).toBeNull();
  });

  it('stores and retrieves a raw string value', () => {
    // setItem stores raw strings, identical to localStorage contract
    __auditStorage.setItem('msg', '"hello"');
    expect(__auditStorage.getItem('msg')).toBe('"hello"');
  });

  it('stores and retrieves a JSON-encoded object (round-trips via JSON)', () => {
    const raw = JSON.stringify({ x: 1 });
    __auditStorage.setItem('obj', raw);
    expect(JSON.parse(__auditStorage.getItem('obj')!)).toEqual({ x: 1 });
  });

  it('removeItem removes the key', () => {
    __auditStorage.setItem('del', 'value');
    __auditStorage.removeItem('del');
    expect(__auditStorage.getItem('del')).toBeNull();
  });

  it('overwrites existing value', () => {
    __auditStorage.setItem('key', 'first');
    __auditStorage.setItem('key', 'second');
    expect(__auditStorage.getItem('key')).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// Tests: migration (first boot copies localStorage → IndexedDB)
// ---------------------------------------------------------------------------

describe('_boot migration', () => {
  it('copies existing localStorage keys to IndexedDB cache on first boot', async () => {
    localStorage.setItem('audit:room1', JSON.stringify({ name: 'Lobby' }));
    localStorage.setItem('count', '42');

    await _boot();

    // Keys should now be in the in-memory cache as raw strings
    const room1 = __auditStorage.getItem('audit:room1');
    expect(room1).not.toBeNull();
    expect(JSON.parse(room1!)).toEqual({ name: 'Lobby' });
    expect(__auditStorage.getItem('count')).toBe('42');
  });

  it('clears localStorage after migration', async () => {
    localStorage.setItem('old-key', 'old-value');
    await _boot();
    // localStorage should be cleared (migration moved data to IndexedDB)
    expect(localStorage.getItem('old-key')).toBeNull();
  });

  it('sets migration sentinel so second boot skips re-migration', async () => {
    localStorage.setItem('pre-existing', 'data');
    await _boot();  // first boot — migrates + sets sentinel

    // Simulate second boot: add a NEW localStorage key (should NOT be migrated)
    localStorage.setItem('new-key', 'new-value');
    _cache.clear();
    await _boot();  // second boot — should not touch localStorage

    // new-key should NOT be in cache (migration skipped)
    expect(_cache.has('new-key')).toBe(false);
    // Sentinel itself should not appear as a user key
    expect(_cache.has(SENTINEL)).toBe(false);
  });

  it('hydrates cache from IndexedDB on subsequent boots', async () => {
    // First boot: stores data via shim
    await _boot();
    __auditStorage.setItem('persist', JSON.stringify('stored-value'));

    // Flush writes by waiting a tick
    await new Promise((r) => setTimeout(r, 10));

    // Second boot from cleared cache
    _cache.clear();
    await _boot();

    expect(__auditStorage.getItem('persist')).not.toBeNull();
  });

  it('handles plain string localStorage values', async () => {
    localStorage.setItem('plain', 'not-json');
    await _boot();
    // Stored and returned as raw string (no JSON parsing)
    expect(__auditStorage.getItem('plain')).toBe('not-json');
  });
});
