import type { TokenStore } from './token-store.js';
import type { AppConfig } from '../platform/config/schema.js';
import type { KeyOptions } from './key-manager.js';
import { EncryptedTokenStore } from './stores/encrypted.js';
import { KeychainTokenStore } from './stores/keychain.js';

/** Construct the configured token store. */
export function createTokenStore(config: AppConfig, keyOpts: KeyOptions = {}): TokenStore {
  switch (config.tokenStore) {
    case 'keychain':
      // OS keychain (opt-in; requires the user to install keytar themselves).
      return new KeychainTokenStore();
    case 'encrypted-file':
    default:
      return new EncryptedTokenStore(keyOpts);
  }
}
