import type { PlatformId } from '../../platform/ids.js';

/**
 * Static description of a platform's OAuth endpoints + scopes. One per platform under
 * auth/profiles/. The OAuthManager drives the loopback + PKCE flow from this; adapters'
 * refreshAuth() use the token endpoint to rotate/extend tokens.
 */
export interface OAuthProfile {
  platform: PlatformId;
  authorizeUrl: string;
  tokenUrl: string;
  /** Scopes requested at authorize time. */
  scopes: string[];
  /** Whether this provider supports/requires PKCE (S256). */
  usePkce: boolean;
  /** Scope delimiter in the authorize URL (LinkedIn/Google use space; some use comma). */
  scopeSeparator?: string;
  /** Extra static params appended to the authorize URL (e.g. Google access_type=offline). */
  extraAuthorizeParams?: Record<string, string>;
  /** OAuth client-id parameter name. Defaults to 'client_id'; TikTok uses 'client_key'. */
  clientIdParam?: string;
}
