import { isPlatformId } from '../../platform/ids.js';
import { loadConfig, platformCreds } from '../../platform/config/load.js';
import { paths } from '../../platform/config/paths.js';
import { registerBuiltinAuthProviders, getAuthProvider } from '../../auth/providers.js';
import { runAuthorizationCodeFlow } from '../../auth/oauth-manager.js';
import { createTokenStore } from '../../auth/store-factory.js';
import { getEncryptionKey } from '../../auth/key-manager.js';
import { upsertAccount } from '../../services/account-registry.js';

export interface AuthOptions {
  noBrowser?: boolean;
}

/** `social-mcp auth <platform>` — connect an account via the OAuth loopback flow. */
export async function authCommand(platform: string, opts: AuthOptions = {}): Promise<void> {
  if (!isPlatformId(platform)) {
    throw new Error(`Unknown platform "${platform}".`);
  }

  const config = loadConfig();
  const creds = platformCreds(config, platform);
  if (!creds) {
    throw new Error(
      `No credentials for "${platform}". Add them under "platforms.${platform}" in ${paths.configFile} (see config.example.json).`,
    );
  }

  registerBuiltinAuthProviders();
  const provider = getAuthProvider(platform); // throws clearly if not implemented yet

  // Resolve the encryption key up front (may prompt) so we fail fast before the browser dance.
  await getEncryptionKey({ allowPrompt: true });

  const redirectUri = `${config.oauth.redirectBaseUrl}/callback`;
  process.stdout.write(
    `Authorizing ${platform}. Make sure "${redirectUri}" is registered as a redirect URL in your ${platform} developer app.\n`,
  );

  const customScopes = creds.extra?.scopes?.split(/[,\s]+/).filter(Boolean);
  const profile = customScopes?.length ? { ...provider.profile, scopes: customScopes } : provider.profile;

  const outcome = await runAuthorizationCodeFlow({
    profile,
    creds,
    redirectBaseUrl: config.oauth.redirectBaseUrl,
    open: !opts.noBrowser,
    onAuthorizeUrl: (url) =>
      process.stdout.write(`\nOpen this URL to authorize (opening automatically if possible):\n${url}\n\n`),
  });

  const identity = await provider.resolveIdentity(outcome, creds);
  const account = upsertAccount({
    platform,
    label: identity.label,
    remoteId: identity.remoteId,
  });

  const store = createTokenStore(config, { allowPrompt: true });
  await store.set({
    accountId: account.id,
    platform,
    // Identity may override the token to store (e.g. Meta stores the Page token).
    accessToken: identity.accessToken ?? outcome.accessToken,
    refreshToken: identity.refreshToken ?? outcome.refreshToken,
    expiresAt: identity.expiresAt ?? outcome.expiresAt,
    scopes: identity.scopes ?? outcome.scopes,
    meta: identity.meta,
    obtainedAt: Date.now(),
  });

  process.stdout.write(`\n✓ Connected ${platform}/${identity.label}\n  account id: ${account.id}\n`);
  if (outcome.expiresAt) {
    process.stdout.write(`  token valid until ${new Date(outcome.expiresAt).toISOString()}\n`);
  }
  if (!outcome.refreshToken) {
    process.stdout.write('  note: no refresh token issued — you will re-auth when it expires.\n');
  }
}
