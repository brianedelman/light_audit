/** Type declarations for html_app/sync-drain.js */

export interface DrainOpts {
  queue?: {
    peek(): Promise<import('./sync-queue').SyncQueueItem[]>;
    markDone(id: number): Promise<void>;
    markFailed(id: number, err: string): Promise<void>;
  };
  post?: (url: string, body: unknown) => Promise<unknown>;
  uploadPart?: (presignedUrl: string, slice: Blob) => Promise<string>;
  getBlob?: (id: string) => Promise<{ blob: Blob; meta: Record<string, unknown> } | undefined>;
}

export interface DrainResult {
  processed: number;
  failed: number;
}

export const BACKOFF_SECS: number[];

export function drainOnce(opts?: DrainOpts): Promise<DrainResult>;
export function startDrain(opts?: DrainOpts & { initialDelayMs?: number }): void;
export function stopDrain(): void;
export function getBackoffIdx(): number;
