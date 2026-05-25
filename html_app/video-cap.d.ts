/** Type declarations for html_app/video-cap.js */

export const MAX_VIDEO_SECS: number;

export interface DurationCheck {
  ok: boolean;
  duration: number;
}

export interface CaptureResult {
  blob: Blob | null;
  rejected: boolean;
  reason: string | null;
}

export interface CaptureOpts {
  maxVideoSecs?: number;
  compressToBlob?: (file: File) => Promise<Blob>;
  _createVideoEl?: () => HTMLVideoElement;
  _createObjectUrl?: (file: File | Blob) => string;
}

export function checkVideoDuration(
  file: File | Blob,
  maxSecs?: number,
  createVideoEl?: () => HTMLVideoElement,
  createObjectUrl?: (file: File | Blob) => string,
): Promise<DurationCheck>;

export function captureWithPolicy(
  file: File,
  photoType: string,
  opts?: CaptureOpts,
): Promise<CaptureResult>;
