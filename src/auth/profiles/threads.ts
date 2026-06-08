import type { OAuthProfile } from './types.js';

/** Threads API OAuth (separate from Facebook Login; threads.net authorize host). */
export const threadsProfile: OAuthProfile = {
  platform: 'threads',
  authorizeUrl: 'https://threads.net/oauth/authorize',
  tokenUrl: 'https://graph.threads.net/oauth/access_token',
  scopes: [
    'threads_basic',
    'threads_content_publish',
    'threads_manage_replies',
    'threads_read_replies',
    'threads_manage_insights',
  ],
  usePkce: false,
  scopeSeparator: ',',
};

export const THREADS_GRAPH_BASE = 'https://graph.threads.net/v1.0';
