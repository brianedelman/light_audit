/** Type declarations for html_app/sync-queue.js */

export interface SyncQueueItem {
  id: number;
  type: 'audit' | 'media';
  payload?: unknown;
  blob_id?: string;
  meta?: Record<string, unknown>;
  retry_count: number;
  last_error: string | null;
}

export function enqueueAudit(payload: unknown): Promise<number>;
export function enqueueMedia(blob_id: string, meta?: Record<string, unknown>): Promise<number>;
export function peek(): Promise<SyncQueueItem[]>;
export function markDone(id: number): Promise<void>;
export function markFailed(id: number, err: string): Promise<void>;
