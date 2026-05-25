/** Type declarations for html_app/compress.js */

export const DEFAULT_MAX_BYTES: number;

export function extractExifTimestamp(file: File | Blob): Promise<Date | null>;

export interface CompressResult {
  blob: Blob;
  timestamp: Date | null;
  width: number;
  height: number;
}

export function compressToTarget(file: File | Blob, maxBytes?: number): Promise<CompressResult>;
