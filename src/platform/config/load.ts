import { readFileSync, existsSync } from 'node:fs';
import { paths } from './paths.js';
import { configSchema, type AppConfig, type PlatformCreds } from './schema.js';
import type { PlatformId } from '../ids.js';

/**
 * Load and validate ~/.social-mcp/config.json. A missing file yields a valid default
 * config with zero platforms configured (the tool is usable but inert until set up).
 */
export function loadConfig(): AppConfig {
  if (!existsSync(paths.configFile)) {
    return configSchema.parse({});
  }
  const raw = readFileSync(paths.configFile, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${paths.configFile}: ${(e as Error).message}`);
  }
  const result = configSchema.safeParse(json);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid config in ${paths.configFile}: ${detail}`);
  }
  return result.data;
}

export function configExists(): boolean {
  return existsSync(paths.configFile);
}

/** Credentials for a single platform, or null if that platform isn't configured. */
export function platformCreds(config: AppConfig, platform: PlatformId): PlatformCreds | null {
  return config.platforms[platform] ?? null;
}

/** Platform ids that have credentials configured. */
export function configuredPlatforms(config: AppConfig): string[] {
  return Object.keys(config.platforms);
}
