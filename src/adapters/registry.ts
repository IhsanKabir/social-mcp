import type { PlatformId } from '../platform/ids.js';
import type { SocialAdapter } from './types.js';

/**
 * Central adapter registry. Each platform module registers a lazy factory; the registry
 * instantiates on first use and caches the singleton (adapters are stateless). Only
 * platforms whose adapter module has been imported are available — which lets the app
 * load just the configured platforms.
 */
type AdapterFactory = () => SocialAdapter;

const factories = new Map<PlatformId, AdapterFactory>();
const instances = new Map<PlatformId, SocialAdapter>();

export function registerAdapter(platform: PlatformId, factory: AdapterFactory): void {
  factories.set(platform, factory);
}

export function getAdapter(platform: PlatformId): SocialAdapter {
  let adapter = instances.get(platform);
  if (adapter) return adapter;
  const factory = factories.get(platform);
  if (!factory) {
    throw new Error(
      `No adapter registered for "${platform}". It may not be implemented yet or its module was not imported.`,
    );
  }
  adapter = factory();
  instances.set(platform, adapter);
  return adapter;
}

export function hasAdapter(platform: PlatformId): boolean {
  return factories.has(platform);
}

export function registeredPlatforms(): PlatformId[] {
  return [...factories.keys()];
}
