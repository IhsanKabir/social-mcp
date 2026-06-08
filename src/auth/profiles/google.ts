import type { OAuthProfile } from './types.js';

/**
 * Google OAuth for the YouTube Data API. Google supports PKCE. access_type=offline +
 * prompt=consent ensures we receive a refresh token. These are restricted scopes — an
 * unverified app is capped at ~100 users and (in Testing mode) refresh tokens expire after
 * 7 days; `doctor` surfaces that caveat.
 */
export const googleProfile: OAuthProfile = {
  platform: 'youtube',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ],
  usePkce: true,
  scopeSeparator: ' ',
  extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
};

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_UPLOAD_ROOT = 'https://www.googleapis.com';
