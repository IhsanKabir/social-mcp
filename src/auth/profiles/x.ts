import type { OAuthProfile } from './types.js';

/**
 * X (Twitter) OAuth 2.0 User Context with PKCE.
 * Confidential clients authenticate the token endpoint using HTTP Basic auth
 * (base64(clientId:clientSecret)).
 *
 * Scopes:
 *  - tweet.read, users.read -> read profile, tweets, replies, mentions, metrics
 *  - tweet.write            -> publish posts and replies
 *  - media.write            -> upload images/videos via v2 media upload
 *  - offline.access         -> issue refresh tokens (access tokens expire in ~2 hours)
 */
export const xProfile: OAuthProfile = {
  platform: 'x',
  authorizeUrl: 'https://x.com/i/oauth2/authorize',
  tokenUrl: 'https://api.x.com/2/oauth2/token',
  scopes: ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'],
  usePkce: true,
  scopeSeparator: ' ',
  tokenAuthMethod: 'basic',
};

export const X_API_BASE = 'https://api.x.com/2';
export const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
