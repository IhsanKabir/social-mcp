import type { TokenStore } from '../auth/token-store.js';
import type { Sampler } from '../content/content-service.js';

/** Shared dependencies passed to every tool/resource registrar. */
export interface McpContext {
  store: TokenStore;
  sampler: Sampler;
}
