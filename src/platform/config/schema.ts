import { z } from 'zod';

/**
 * One platform's developer-app credentials. These are the USER's own credentials from
 * their own developer app (see README per-platform setup). Meta platforms use the App ID
 * as clientId and App Secret as clientSecret.
 */
export const platformCredsSchema = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    /** Optional platform-specific extras (e.g. configured redirect path, page hints). */
    extra: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const configSchema = z
  .object({
    tokenStore: z.enum(['encrypted-file', 'keychain']).default('encrypted-file'),
    oauth: z
      .object({
        /**
         * The loopback base URL the OAuth callback lands on. Most providers (LinkedIn,
         * Meta) require the redirect URI to be registered EXACTLY, so this is a fixed URL
         * (default port 8765) the user registers in their developer app — not a random port.
         */
        redirectBaseUrl: z.string().url().default('http://localhost:8765'),
      })
      .default({}),
    platforms: z.record(z.string(), platformCredsSchema).default({}),
    ai: z
      .object({
        anthropicApiKey: z.string().optional(),
      })
      .default({}),
    daemon: z
      .object({
        pollIntervalMs: z.number().int().positive().default(15000),
      })
      .default({}),
    web: z
      .object({
        port: z.number().int().positive().default(8766),
      })
      .default({}),
  })
  .strict();

export type AppConfig = z.infer<typeof configSchema>;
export type PlatformCreds = z.infer<typeof platformCredsSchema>;
