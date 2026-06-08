import type { TokenStore, StoredToken, TokenSummary } from '../token-store.js';

/**
 * Opt-in OS keychain token store. `keytar` is a NATIVE module and is intentionally NOT a
 * dependency of this project (it would break clone-and-run on machines without build tools).
 * Users who want OS-keychain storage install it themselves (`npm install keytar`); we load it
 * via a dynamic specifier so the bundler/type-checker never requires it to be present.
 */
const SERVICE = 'social-mcp';

interface KeytarApi {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<{ account: string; password: string }[]>;
}

let cached: KeytarApi | null = null;

async function loadKeytar(): Promise<KeytarApi> {
  if (cached) return cached;
  const specifier = 'keytar'; // non-literal so the type-checker doesn't resolve it
  try {
    const mod = (await import(specifier)) as { default?: KeytarApi } & KeytarApi;
    cached = (mod.default ?? mod) as KeytarApi;
    return cached;
  } catch {
    throw new Error(
      'tokenStore "keychain" requires the optional "keytar" package. Install it with `npm install keytar` (needs OS build tools), or use tokenStore "encrypted-file".',
    );
  }
}

export class KeychainTokenStore implements TokenStore {
  async set(token: StoredToken): Promise<void> {
    const keytar = await loadKeytar();
    await keytar.setPassword(SERVICE, token.accountId, JSON.stringify(token));
  }

  async get(accountId: string): Promise<StoredToken | null> {
    const keytar = await loadKeytar();
    const raw = await keytar.getPassword(SERVICE, accountId);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  }

  async delete(accountId: string): Promise<void> {
    const keytar = await loadKeytar();
    await keytar.deletePassword(SERVICE, accountId);
  }

  async list(): Promise<TokenSummary[]> {
    const keytar = await loadKeytar();
    const creds = await keytar.findCredentials(SERVICE);
    return creds.map((c) => {
      const t = JSON.parse(c.password) as StoredToken;
      return { accountId: t.accountId, platform: t.platform, scopes: t.scopes, expiresAt: t.expiresAt };
    });
  }

  async expiringBefore(beforeMs: number): Promise<StoredToken[]> {
    const keytar = await loadKeytar();
    const creds = await keytar.findCredentials(SERVICE);
    return creds
      .map((c) => JSON.parse(c.password) as StoredToken)
      .filter((t) => t.expiresAt != null && t.expiresAt < beforeMs);
  }
}
