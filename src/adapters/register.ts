import { registerAdapter } from './registry.js';
import { LinkedInAdapter } from './linkedin/adapter.js';
import { FacebookAdapter } from './facebook/adapter.js';
import { InstagramAdapter } from './instagram/adapter.js';
import { ThreadsAdapter } from './threads/adapter.js';
import { YouTubeAdapter } from './youtube/adapter.js';
import { TikTokAdapter } from './tiktok/adapter.js';
import { XAdapter } from './x/adapter.js';

let done = false;

/**
 * Register all built-in platform adapters (idempotent). Importing only the adapters that
 * are implemented keeps the registry honest about what's available. New platforms are
 * added here as their adapters land.
 */
export function registerBuiltinAdapters(): void {
  if (done) return;
  done = true;
  registerAdapter('linkedin', () => new LinkedInAdapter());
  registerAdapter('facebook', () => new FacebookAdapter());
  registerAdapter('instagram', () => new InstagramAdapter());
  registerAdapter('threads', () => new ThreadsAdapter());
  registerAdapter('youtube', () => new YouTubeAdapter());
  registerAdapter('tiktok', () => new TikTokAdapter());
  registerAdapter('x', () => new XAdapter());
}
