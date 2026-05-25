/** Type declarations for html_app/photo-store.js */

import type { BlobRecord } from './storage.js';

export interface AuditStorageApi {
  putBlob(id: string, blob: Blob, meta?: Record<string, unknown>): Promise<void>;
  getBlob(id: string): Promise<BlobRecord | undefined>;
}

export const BLOB_PREFIX: string;
export function blobId(uuid: string): string;
export function isBlobId(val: string): boolean;
export function resolvePhotoSrc(val: string, storage: AuditStorageApi): Promise<string>;
export function migratePhotosToBlobs(
  roomPhotos: Record<string, string[]>,
  storage: AuditStorageApi,
): Promise<{ changed: boolean }>;
export function capturePhotoBlob(
  file: File,
  key: string,
  meta: Record<string, unknown>,
  storage: AuditStorageApi,
  compressToBlob: (file: File) => Promise<Blob>,
): Promise<string | null>;
