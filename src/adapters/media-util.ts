import type { MediaAsset } from './types.js';

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|#|$)/i;

/** Heuristic: treat an asset as video by mime type or file/URL extension. */
export function isVideoAsset(asset: MediaAsset): boolean {
  if (asset.mime?.startsWith('video/')) return true;
  const ref = asset.url ?? asset.path ?? '';
  return VIDEO_EXT.test(ref);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
