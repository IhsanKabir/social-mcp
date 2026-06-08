import open from 'open';
import { request } from '../platform/http/client.js';
import { createPkce, randomState } from './pkce.js';
import { waitForCallback } from './loopback-server.js';
import type { OAuthProfile } from './profiles/types.js';

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  [k: string]: unknown;
}

export interface OAuthOutcome {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scopes: string[];
  raw: TokenResponse;
}

export interface AuthFlowOptions {
  profile: OAuthProfile;
  creds: OAuthCredentials;
  /** Loopback base URL, e.g. http://localhost:8765 (callback path is appended). */
  redirectBaseUrl: string;
  /** Auto-open the browser (default true). */
  open?: boolean;
  /** Called with the authorize URL (used to print it / for tests). */
  onAuthorizeUrl?: (url: string) => void;
}

const CALLBACK_PATH = '/callback';

/**
 * Run the OAuth 2.0 authorization-code flow against a loopback redirect, returning the
 * resulting tokens. Uses PKCE when the profile requests it, and a `state` value to guard
 * against CSRF / code interception.
 */
export async function runAuthorizationCodeFlow(opts: AuthFlowOptions): Promise<OAuthOutcome> {
  const redirectUri = `${opts.redirectBaseUrl}${CALLBACK_PATH}`;
  const url = new URL(opts.redirectBaseUrl);
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const host = url.hostname;

  const state = randomState();
  const pkce = opts.profile.usePkce ? createPkce() : null;
  const authorizeUrl = buildAuthorizeUrl(
    opts.profile,
    opts.creds.clientId,
    redirectUri,
    state,
    pkce?.challenge,
  );

  // Start listening BEFORE opening the browser to avoid a race.
  const callbackPromise = waitForCallback({ port, host, path: CALLBACK_PATH });

  opts.onAuthorizeUrl?.(authorizeUrl);
  if (opts.open !== false) {
    try {
      await open(authorizeUrl);
    } catch {
      // Browser launch failed; the URL was already surfaced via onAuthorizeUrl.
    }
  }

  const cb = await callbackPromise;
  if (cb.error) {
    throw new Error(`Authorization failed: ${cb.error} ${cb.errorDescription ?? ''}`.trim());
  }
  if (!cb.code) throw new Error('No authorization code returned by the provider.');
  if (cb.state !== state) throw new Error('State mismatch — possible CSRF; aborting.');

  const token = await exchangeCode(opts.profile, opts.creds, redirectUri, cb.code, pkce?.verifier);
  const scopes = token.scope ? token.scope.split(/[ ,]+/).filter(Boolean) : opts.profile.scopes;
  const expiresAt = token.expires_in ? Date.now() + token.expires_in * 1000 : null;

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt,
    scopes,
    raw: token,
  };
}

export function buildAuthorizeUrl(
  profile: OAuthProfile,
  clientId: string,
  redirectUri: string,
  state: string,
  challenge?: string,
): string {
  const u = new URL(profile.authorizeUrl);
  const sep = profile.scopeSeparator ?? ' ';
  const idParam = profile.clientIdParam ?? 'client_id';
  u.searchParams.set('response_type', 'code');
  u.searchParams.set(idParam, clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', profile.scopes.join(sep));
  u.searchParams.set('state', state);
  for (const [k, v] of Object.entries(profile.extraAuthorizeParams ?? {})) {
    u.searchParams.set(k, v);
  }
  if (challenge) {
    u.searchParams.set('code_challenge', challenge);
    u.searchParams.set('code_challenge_method', 'S256');
  }
  return u.toString();
}

async function exchangeCode(
  profile: OAuthProfile,
  creds: OAuthCredentials,
  redirectUri: string,
  code: string,
  verifier?: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    [profile.clientIdParam ?? 'client_id']: creds.clientId,
    client_secret: creds.clientSecret,
  });
  if (verifier) body.set('code_verifier', verifier);

  const res = await request(profile.tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
  });
  return (await res.json()) as TokenResponse;
}
