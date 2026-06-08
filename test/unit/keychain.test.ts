import { describe, it, expect } from 'vitest';
import { KeychainTokenStore } from '../../src/auth/stores/keychain.js';

describe('KeychainTokenStore', () => {
  const store = new KeychainTokenStore();

  it('throws a helpful error when keytar is not installed', async () => {
    // keytar is intentionally not a dependency, so every operation should explain how to enable it.
    await expect(store.get('any')).rejects.toThrow(/keytar/i);
    await expect(store.list()).rejects.toThrow(/keytar/i);
  });
});
