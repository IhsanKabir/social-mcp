import type { PlatformId } from '../platform/ids.js';
import type { OAuthProfile } from './profiles/types.js';
import type { OAuthOutcome, OAuthCredentials } from './oauth-manager.js';
import { requestJson } from '../platform/http/client.js';
import { graphGet, exchangeLongLivedToken } from '../adapters/meta/graph.js';
import { linkedinProfile, LINKEDIN_USERINFO_URL } from './profiles/linkedin.js';
import { facebookProfile, instagramProfile } from './profiles/meta.js';
import { threadsProfile, THREADS_GRAPH_BASE } from './profiles/threads.js';
import { googleProfile, YOUTUBE_API_BASE } from './profiles/google.js';
import { tiktokProfile, TIKTOK_USERINFO_URL } from './profiles/tiktok.js';

/** Who the freshly-authorized token belongs to, plus any override of the token to store. */
export interface AccountIdentity {
  remoteId: string;
  label: string;
  meta: Record<string, string>;
  /** Override the stored access token (Meta stores the Page token, not the user token). */
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scopes?: string[];
}

export interface AuthProvider {
  profile: OAuthProfile;
  resolveIdentity(outcome: OAuthOutcome, creds: OAuthCredentials): Promise<AccountIdentity>;
}

const providers = new Map<PlatformId, AuthProvider>();

export function registerAuthProvider(platform: PlatformId, provider: AuthProvider): void {
  providers.set(platform, provider);
}

export function getAuthProvider(platform: PlatformId): AuthProvider {
  const p = providers.get(platform);
  if (!p) {
    throw new Error(
      `OAuth for "${platform}" is not available yet. Implemented: ${[...providers.keys()].join(', ') || '(none)'}.`,
    );
  }
  return p;
}

interface FbPage {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string };
}

let registered = false;

/** Register all built-in auth providers (idempotent). */
export function registerBuiltinAuthProviders(): void {
  if (registered) return;
  registered = true;

  registerAuthProvider('linkedin', {
    profile: linkedinProfile,
    async resolveIdentity(outcome): Promise<AccountIdentity> {
      const info = await requestJson<{ sub: string; name?: string }>(LINKEDIN_USERINFO_URL, {
        headers: { authorization: `Bearer ${outcome.accessToken}` },
      });
      const urn = `urn:li:person:${info.sub}`;
      return { remoteId: urn, label: info.name ?? info.sub, meta: { authorUrn: urn } };
    },
  });

  registerAuthProvider('facebook', {
    profile: facebookProfile,
    async resolveIdentity(outcome, creds): Promise<AccountIdentity> {
      const longLived = await exchangeLongLivedToken(creds, outcome.accessToken);
      const res = await graphGet<{ data?: FbPage[] }>('/me/accounts', {
        access_token: longLived.token,
        fields: 'id,name,access_token',
      });
      const page = res.data?.[0];
      if (!page?.access_token) {
        throw new Error('No Facebook Page found. Create or get a role on a Page, then retry.');
      }
      return {
        remoteId: page.id,
        label: page.name ?? page.id,
        meta: { pageId: page.id, clientId: creds.clientId, clientSecret: creds.clientSecret },
        accessToken: page.access_token,
        expiresAt: longLived.expiresAt,
        scopes: outcome.scopes,
      };
    },
  });

  registerAuthProvider('instagram', {
    profile: instagramProfile,
    async resolveIdentity(outcome, creds): Promise<AccountIdentity> {
      const longLived = await exchangeLongLivedToken(creds, outcome.accessToken);
      const res = await graphGet<{ data?: FbPage[] }>('/me/accounts', {
        access_token: longLived.token,
        fields: 'id,name,access_token,instagram_business_account',
      });
      const page = (res.data ?? []).find((p) => p.instagram_business_account?.id);
      if (!page?.access_token || !page.instagram_business_account) {
        throw new Error('No Instagram Business account linked to any of your Facebook Pages.');
      }
      const igId = page.instagram_business_account.id;
      const ig = await graphGet<{ username?: string }>(`/${igId}`, {
        access_token: page.access_token,
        fields: 'username',
      });
      return {
        remoteId: igId,
        label: ig.username ?? igId,
        meta: {
          igUserId: igId,
          pageId: page.id,
          clientId: creds.clientId,
          clientSecret: creds.clientSecret,
        },
        accessToken: page.access_token,
        expiresAt: longLived.expiresAt,
        scopes: outcome.scopes,
      };
    },
  });

  registerAuthProvider('threads', {
    profile: threadsProfile,
    async resolveIdentity(outcome, creds): Promise<AccountIdentity> {
      // Exchange the short-lived token for a long-lived one (~60 days).
      const longLived = await graphGet<{ access_token: string; expires_in?: number }>(
        '/access_token',
        {
          grant_type: 'th_exchange_token',
          client_secret: creds.clientSecret,
          access_token: outcome.accessToken,
        },
        'https://graph.threads.net',
      );
      const me = await graphGet<{ id: string; username?: string }>(
        '/me',
        { access_token: longLived.access_token, fields: 'id,username' },
        THREADS_GRAPH_BASE,
      );
      return {
        remoteId: me.id,
        label: me.username ?? me.id,
        meta: { threadsUserId: me.id },
        accessToken: longLived.access_token,
        expiresAt: longLived.expires_in ? Date.now() + longLived.expires_in * 1000 : null,
        scopes: outcome.scopes,
      };
    },
  });

  registerAuthProvider('youtube', {
    profile: googleProfile,
    async resolveIdentity(outcome, creds): Promise<AccountIdentity> {
      const res = await requestJson<{ items?: { id: string; snippet?: { title?: string } }[] }>(
        `${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`,
        { headers: { authorization: `Bearer ${outcome.accessToken}` } },
      );
      const channel = res.items?.[0];
      if (!channel) throw new Error('No YouTube channel found for this Google account.');
      return {
        remoteId: channel.id,
        label: channel.snippet?.title ?? channel.id,
        // Store app creds so refreshAuth can mint new access tokens from the refresh token.
        meta: { channelId: channel.id, clientId: creds.clientId, clientSecret: creds.clientSecret },
      };
    },
  });

  registerAuthProvider('tiktok', {
    profile: tiktokProfile,
    async resolveIdentity(outcome, creds): Promise<AccountIdentity> {
      const info = await requestJson<{ data?: { user?: { open_id?: string; display_name?: string } } }>(
        `${TIKTOK_USERINFO_URL}?fields=open_id,display_name`,
        { headers: { authorization: `Bearer ${outcome.accessToken}` } },
      );
      const user = info.data?.user;
      const openId = user?.open_id ?? 'tiktok-user';
      return {
        remoteId: openId,
        label: user?.display_name ?? openId,
        meta: { openId, clientId: creds.clientId, clientSecret: creds.clientSecret },
      };
    },
  });
}
