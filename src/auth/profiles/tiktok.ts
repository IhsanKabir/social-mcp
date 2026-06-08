import type { OAuthProfile } from './types.js';

/**
 * TikTok OAuth v2. Note TikTok uses `client_key` (not `client_id`) and supports PKCE.
 * Unaudited apps can use `video.upload` (upload to the creator's inbox as a draft);
 * `video.publish` (public direct post) requires a manual app audit.
 */
export const tiktokProfile: OAuthProfile = {
  platform: 'tiktok',
  authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
  tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
  scopes: ['user.info.basic', 'video.upload'],
  usePkce: true,
  scopeSeparator: ',',
  clientIdParam: 'client_key',
};

export const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';
export const TIKTOK_USERINFO_URL = `${TIKTOK_API_BASE}/user/info/`;
export const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
