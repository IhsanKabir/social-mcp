/**
 * Canonical list of platforms the system knows about.
 * TikTok is present in the type space but deferred for v1 (see plan: gated posting).
 */
export const PLATFORMS = [
  'linkedin',
  'facebook',
  'instagram',
  'threads',
  'youtube',
  'tiktok',
] as const;

export type PlatformId = (typeof PLATFORMS)[number];

export function isPlatformId(value: string): value is PlatformId {
  return (PLATFORMS as readonly string[]).includes(value);
}
