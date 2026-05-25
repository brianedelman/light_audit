/** Type declarations for html_app/storage.js */

export interface BlobRecord {
  id: string;
  blob: Blob;
  meta: Record<string, unknown>;
}

export function getJSON(key: string): Promise<unknown>;
export function setJSON(key: string, value: unknown): Promise<void>;
export function putBlob(id: string, blob: Blob, meta?: Record<string, unknown>): Promise<void>;
export function getBlob(id: string): Promise<BlobRecord | undefined>;
export function listBlobs(filter?: (meta: Record<string, unknown>) => boolean): Promise<BlobRecord[]>;
export function deleteBlob(id: string): Promise<void>;
