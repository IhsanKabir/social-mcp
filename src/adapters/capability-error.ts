import type { PlatformId } from '../platform/ids.js';

/**
 * Thrown by an adapter when asked to do something its platform's API does not support.
 * Higher layers (services / MCP tools) should generally check capabilities FIRST and
 * degrade gracefully with an explanation rather than letting this surface — but adapters
 * throw it defensively so a capability gap can never silently produce a wrong action.
 */
export class CapabilityError extends Error {
  readonly platform: PlatformId;
  readonly capability: string;

  constructor(platform: PlatformId, capability: string, detail?: string) {
    super(
      `${platform} does not support "${capability}" via the official API` +
        (detail ? `: ${detail}` : ''),
    );
    this.name = 'CapabilityError';
    this.platform = platform;
    this.capability = capability;
  }
}
