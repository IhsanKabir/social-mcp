import type { OAuthProfile } from './types.js';

/**
 * LinkedIn "Sign In with LinkedIn (OpenID Connect)" + "Share on LinkedIn".
 *  - openid, profile  -> identify the member (userinfo -> sub -> person URN)
 *  - w_member_social  -> create posts on the member's behalf
 *
 * LinkedIn is a confidential client (uses client_secret at the token endpoint) and does
 * not use PKCE. The redirect URI must be registered EXACTLY in the developer app.
 */
export const linkedinProfile: OAuthProfile = {
  platform: 'linkedin',
  authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
  scopes: ['openid', 'profile', 'w_member_social'],
  usePkce: false,
  scopeSeparator: ' ',
};

export const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
