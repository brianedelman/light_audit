/** Type declarations for html_app/storage-shim.js */

export interface AuditStorageShim {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const __auditStorage: AuditStorageShim;
export const SENTINEL: string;
export const _cache: Map<string, unknown>;
export function _boot(): Promise<void>;
