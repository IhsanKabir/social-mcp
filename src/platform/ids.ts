/**
 * Canonical list of platforms the system knows about.
 */
export const PLATFORMS = [
  'linkedin',
  'facebook',
  'instagram',
  'threads',
  'youtube',
  'tiktok',
  'x',
] as const;

export type PlatformId = (typeof PLATFORMS)[number];

export function isPlatformId(value: string): value is PlatformId {
  return (PLATFORMS as readonly string[]).includes(value);
}
