import type { OAuthProfile } from './types.js';

const META_VERSION = 'v21.0';
const AUTHORIZE = `https://www.facebook.com/${META_VERSION}/dialog/oauth`;
const TOKEN = `https://graph.facebook.com/${META_VERSION}/oauth/access_token`;

/** Facebook Pages OAuth (Facebook Login). Meta uses comma-separated scopes and client_secret. */
export const facebookProfile: OAuthProfile = {
  platform: 'facebook',
  authorizeUrl: AUTHORIZE,
  tokenUrl: TOKEN,
  scopes: [
    'pages_show_list',
    'pages_manage_posts',
    'pages_read_engagement',
    'pages_manage_engagement',
    'read_insights',
    'business_management',
  ],
  usePkce: false,
  scopeSeparator: ',',
};

/** Instagram (Graph API via a linked Facebook Page). */
export const instagramProfile: OAuthProfile = {
  platform: 'instagram',
  authorizeUrl: AUTHORIZE,
  tokenUrl: TOKEN,
  scopes: [
    'pages_show_list',
    'business_management',
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'pages_read_engagement',
  ],
  usePkce: false,
  scopeSeparator: ',',
};
