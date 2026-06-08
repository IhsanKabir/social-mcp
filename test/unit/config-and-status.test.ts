import { describe, it, expect } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { paths } from '../../src/platform/config/paths.js';
import {
  loadConfig,
  configExists,
  platformCreds,
  configuredPlatforms,
} from '../../src/platform/config/load.js';
import { daemonStatus, isDaemonRunning } from '../../src/scheduler/status.js';

describe('config load', () => {
  it('returns defaults when no config file exists', () => {
    rmSync(paths.configFile, { force: true });
    expect(configExists()).toBe(false);
    const config = loadConfig();
    expect(config.tokenStore).toBe('encrypted-file');
    expect(configuredPlatforms(config)).toHaveLength(0);
    expect(platformCreds(config, 'linkedin')).toBeNull();
  });

  it('loads and validates a real config', () => {
    writeFileSync(
      paths.configFile,
      JSON.stringify({ platforms: { linkedin: { clientId: 'a', clientSecret: 'b' } } }),
    );
    const config = loadConfig();
    expect(configExists()).toBe(true);
    expect(platformCreds(config, 'linkedin')?.clientId).toBe('a');
    expect(configuredPlatforms(config)).toContain('linkedin');
    rmSync(paths.configFile, { force: true });
  });

  it('throws on invalid JSON', () => {
    writeFileSync(paths.configFile, '{ not json');
    expect(() => loadConfig()).toThrow(/Invalid JSON/);
    rmSync(paths.configFile, { force: true });
  });

  it('throws on schema violation', () => {
    writeFileSync(paths.configFile, JSON.stringify({ platforms: { linkedin: { clientId: 'a' } } }));
    expect(() => loadConfig()).toThrow(/Invalid config/);
    rmSync(paths.configFile, { force: true });
  });
});

describe('daemon status', () => {
  it('reports not running with no pid file', () => {
    rmSync(paths.daemonPid, { force: true });
    expect(isDaemonRunning()).toBe(false);
    const s = daemonStatus();
    expect(s.running).toBe(false);
    expect(typeof s.queued).toBe('number');
  });
});
